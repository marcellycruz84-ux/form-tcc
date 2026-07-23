-- Migration to add group campaigns feature for academic use.

-- 1. Create the main table for campaigns
CREATE TABLE public.group_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title character varying(160) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    access_token text DEFAULT extensions.uuid_generate_v4() NOT NULL UNIQUE,
    consent_title text,
    consent_body text
);

-- 2. Create a join table for campaigns and instruments (many-to-many)
CREATE TABLE public.group_campaign_instruments (
    campaign_id uuid NOT NULL REFERENCES public.group_campaigns(id) ON DELETE CASCADE,
    instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, instrument_id)
);

-- 3. Create a table to store responses for campaigns
CREATE TABLE public.group_campaign_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    campaign_id uuid NOT NULL REFERENCES public.group_campaigns(id) ON DELETE CASCADE,
    status text DEFAULT 'started'::text NOT NULL, -- 'started', 'completed'
    completed_at timestamp with time zone,
    -- Anonymous participant identifier, unique per campaign
    participant_session_id text NOT NULL,
    UNIQUE (campaign_id, participant_session_id)
);

-- 4. Alter the existing 'answers' table to support campaign responses
-- This column will be NULL for clinical (patient-based) assessments
ALTER TABLE public.answers
ADD COLUMN group_campaign_response_id uuid REFERENCES public.group_campaign_responses(id) ON DELETE CASCADE;

-- 5. Enable RLS and define policies
ALTER TABLE public.group_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_campaign_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_campaign_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated user can manage their own campaigns"
ON public.group_campaigns FOR ALL
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated user can manage their own campaign instruments"
ON public.group_campaign_instruments FOR ALL
USING ((SELECT user_id FROM public.group_campaigns WHERE id = campaign_id) = auth.uid());

CREATE POLICY "Authenticated user can view responses to their campaigns"
ON public.group_campaign_responses FOR SELECT
USING ((SELECT user_id FROM public.group_campaigns WHERE id = campaign_id) = auth.uid());

-- 6. Grant usage permissions to the authenticated role
GRANT ALL ON TABLE public.group_campaigns TO authenticated;
GRANT ALL ON TABLE public.group_campaign_instruments TO authenticated;
GRANT ALL ON TABLE public.group_campaign_responses TO authenticated;