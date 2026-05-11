--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: academicassettype; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.academicassettype AS ENUM (
    'FLASHCARDS',
    'QUIZ',
    'SUMMARY',
    'MINDMAP'
);


--
-- Name: accountstatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.accountstatus AS ENUM (
    'ACTIVE',
    'PENDING_VERIFICATION',
    'SUSPENDED'
);


--
-- Name: contributionstatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contributionstatus AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'REVISION_REQUESTED'
);


--
-- Name: contributorrequeststatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contributorrequeststatus AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: courselanguage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.courselanguage AS ENUM (
    'FR',
    'EN',
    'AR'
);


--
-- Name: courselevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.courselevel AS ENUM (
    'L1',
    'L2',
    'L3',
    'M1',
    'M2',
    'DOCTORAT',
    'OTHER'
);


--
-- Name: coursetype; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.coursetype AS ENUM (
    'LECTURE',
    'TD',
    'TP',
    'EXAM',
    'SUMMARY',
    'OTHER'
);


--
-- Name: difficultylevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.difficultylevel AS ENUM (
    'EASY',
    'MEDIUM',
    'HARD'
);


--
-- Name: documentpipelinestatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.documentpipelinestatus AS ENUM (
    'QUEUED',
    'OCR_PROCESSING',
    'EMBEDDING',
    'READY',
    'FAILED'
);


--
-- Name: forumpoststatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.forumpoststatus AS ENUM (
    'OPEN',
    'RESOLVED'
);


--
-- Name: gender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender AS ENUM (
    'MALE',
    'FEMALE',
    'OTHER',
    'PREFER_NOT_TO_SAY'
);


--
-- Name: learningpathjobstatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.learningpathjobstatus AS ENUM (
    'PROCESSING',
    'READY',
    'FAILED'
);


--
-- Name: learningspeed; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.learningspeed AS ENUM (
    'SLOW',
    'MEDIUM',
    'FAST'
);


--
-- Name: learningstyle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.learningstyle AS ENUM (
    'VISUAL',
    'TEXTUAL',
    'MIXED'
);


--
-- Name: otppurpose; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.otppurpose AS ENUM (
    'ACCOUNT_ACTIVATION',
    'TEACHER_ONBOARDING',
    'PASSWORD_RESET'
);


--
-- Name: studentlevel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.studentlevel AS ENUM (
    'L1',
    'L2',
    'L3',
    'M1',
    'M2',
    'DOCTORAT'
);


--
-- Name: summaryformat; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.summaryformat AS ENUM (
    'EXECUTIVE',
    'STRUCTURED',
    'COMPARATIVE'
);


--
-- Name: teacherrequeststatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.teacherrequeststatus AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


--
-- Name: userrole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.userrole AS ENUM (
    'STUDENT',
    'TEACHER',
    'ADMIN',
    'SUPERADMIN'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: academic_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academic_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_uuid uuid NOT NULL,
    asset_type text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    model_version text,
    chunk_count integer,
    CONSTRAINT academic_assets_asset_type_check CHECK ((asset_type = ANY (ARRAY['flashcards'::text, 'mindmap'::text, 'exam'::text, 'summary'::text])))
);


--
-- Name: academicassetcache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.academicassetcache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_version_id uuid NOT NULL,
    asset_type public.academicassettype NOT NULL,
    target_lang character varying NOT NULL,
    profile character varying NOT NULL,
    content jsonb,
    chunk_count integer NOT NULL,
    source_pipeline_version character varying NOT NULL,
    model_version character varying,
    is_stale boolean NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: contribution; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contribution (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying NOT NULL,
    description character varying,
    status public.contributionstatus NOT NULL,
    is_demo_submission boolean NOT NULL,
    course_type public.coursetype NOT NULL,
    language public.courselanguage NOT NULL,
    academic_year character varying,
    created_at timestamp without time zone NOT NULL,
    rejection_reason character varying,
    quality_flag boolean NOT NULL,
    uploader_id uuid,
    course_id uuid
);


--
-- Name: contributorrequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contributorrequest (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    demo_contribution_id uuid NOT NULL,
    status public.contributorrequeststatus NOT NULL,
    ocr_quality_score double precision NOT NULL,
    reviewed_by uuid,
    review_note character varying,
    created_at timestamp without time zone NOT NULL,
    reviewed_at timestamp without time zone
);


--
-- Name: course; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying NOT NULL,
    description character varying,
    level public.courselevel NOT NULL,
    academic_year character varying NOT NULL,
    tags text,
    created_at timestamp without time zone NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    department_id uuid,
    major_id uuid,
    filiere character varying
);


--
-- Name: daily_goal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_goal (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    description character varying NOT NULL,
    is_completed boolean DEFAULT false NOT NULL,
    priority integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: department; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    establishment_id uuid NOT NULL,
    created_at timestamp without time zone NOT NULL,
    is_deleted boolean DEFAULT false
);


--
-- Name: documentannotation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentannotation (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_version_id uuid NOT NULL,
    user_id uuid NOT NULL,
    page_number integer NOT NULL,
    x double precision NOT NULL,
    y double precision NOT NULL,
    content character varying NOT NULL,
    is_public boolean NOT NULL,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: documentembedding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentembedding (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_version_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    chunk_text character varying,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    original_filename text NOT NULL,
    canonical_path text NOT NULL,
    upload_timestamp timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    user_id text,
    chunk_count integer,
    ocr_mode text,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'ingesting'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: documentversion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documentversion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version_number integer NOT NULL,
    storage_path character varying NOT NULL,
    file_size_bytes integer NOT NULL,
    mime_type character varying NOT NULL,
    sha256_hash character varying NOT NULL,
    ocr_text character varying,
    language character varying(10),
    quality_score double precision,
    simhash character varying,
    pipeline_status public.documentpipelinestatus NOT NULL,
    parser_used character varying,
    has_structured_content boolean NOT NULL,
    uploaded_at timestamp without time zone NOT NULL,
    is_deleted boolean NOT NULL,
    contribution_id uuid NOT NULL
);


--
-- Name: establishment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.establishment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    domain character varying NOT NULL,
    is_authorized boolean NOT NULL,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: flashcard; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flashcard (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deck_id uuid NOT NULL,
    question character varying NOT NULL,
    answer character varying NOT NULL,
    difficulty public.difficultylevel NOT NULL,
    next_review_at timestamp without time zone NOT NULL,
    last_reviewed_at timestamp without time zone,
    "interval" integer NOT NULL,
    ease_factor double precision NOT NULL,
    repetitions integer NOT NULL
);


--
-- Name: flashcarddeck; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flashcarddeck (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    document_version_ids text,
    title character varying NOT NULL,
    share_token character varying,
    card_count integer NOT NULL,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: learninginsight; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learninginsight (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    insight_type character varying NOT NULL,
    insight_text character varying NOT NULL,
    action_type character varying NOT NULL,
    action_payload character varying NOT NULL,
    is_read boolean NOT NULL,
    is_actioned boolean NOT NULL,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: learningpathjob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learningpathjob (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    input_json jsonb,
    result_json jsonb,
    status public.learningpathjobstatus NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: major; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.major (
    id uuid NOT NULL,
    name character varying NOT NULL,
    department_id uuid NOT NULL,
    level public.courselevel NOT NULL,
    created_at timestamp without time zone NOT NULL,
    is_deleted boolean DEFAULT false
);


--
-- Name: message; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    role character varying NOT NULL,
    content character varying NOT NULL,
    source_page integer,
    cosine_similarity double precision,
    chunk_text character varying,
    "timestamp" timestamp without time zone NOT NULL
);


--
-- Name: mindmap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mindmap (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    document_version_ids text,
    title character varying,
    target_lang character varying NOT NULL,
    nodes_json jsonb,
    edges_json jsonb,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title character varying NOT NULL,
    message character varying NOT NULL,
    is_read boolean NOT NULL,
    contribution_id uuid,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: otptoken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otptoken (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    purpose public.otppurpose NOT NULL,
    otp_code_hash character varying NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    attempts integer NOT NULL,
    max_attempts integer NOT NULL,
    is_used boolean NOT NULL,
    created_at timestamp without time zone NOT NULL,
    consumed_at timestamp without time zone
);


--
-- Name: parent_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parent_chunks (
    id uuid NOT NULL,
    document_uuid uuid,
    content text NOT NULL,
    token_count integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: question; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quiz_session_id uuid NOT NULL,
    question_text character varying NOT NULL,
    question_type character varying NOT NULL,
    options jsonb,
    correct_answer character varying NOT NULL,
    explanation character varying,
    source_page integer,
    student_answer character varying,
    is_correct boolean,
    ai_feedback character varying
);


--
-- Name: quizsession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quizsession (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    document_version_ids text,
    score double precision,
    total_questions integer NOT NULL,
    time_limit_minutes integer NOT NULL,
    is_completed boolean NOT NULL,
    submitted_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: ragsession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ragsession (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    document_version_ids text,
    message_count integer NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: readingprogress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.readingprogress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    document_version_id uuid NOT NULL,
    last_page integer NOT NULL,
    scroll_y double precision NOT NULL,
    last_accessed_at timestamp without time zone NOT NULL
);


--
-- Name: study_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.study_session (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    started_at timestamp without time zone NOT NULL,
    ended_at timestamp without time zone,
    source character varying
);


--
-- Name: summary; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.summary (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    document_version_ids text,
    format public.summaryformat NOT NULL,
    target_lang character varying NOT NULL,
    content jsonb,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: teacherprofile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacherprofile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    department_id uuid,
    specialization character varying,
    modules character varying,
    invite_token character varying,
    invite_expires_at timestamp without time zone
);


--
-- Name: teacherverificationrequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacherverificationrequest (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    requested_department character varying NOT NULL,
    requested_domain character varying NOT NULL,
    establishment_id uuid,
    status public.teacherrequeststatus NOT NULL,
    reviewed_by uuid,
    review_note character varying,
    created_at timestamp without time zone NOT NULL,
    reviewed_at timestamp without time zone
);


--
-- Name: topicknowledge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topicknowledge (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    course_id uuid,
    topic_name character varying NOT NULL,
    confidence_score double precision NOT NULL,
    total_attempts integer DEFAULT 0 NOT NULL,
    correct_attempts integer DEFAULT 0 NOT NULL,
    last_quiz_id uuid,
    last_attempt_at timestamp without time zone,
    needs_review boolean NOT NULL,
    review_due_at timestamp without time zone,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    email character varying NOT NULL,
    full_name character varying,
    role public.userrole NOT NULL,
    status public.accountstatus NOT NULL,
    establishment_id uuid,
    trust_score integer NOT NULL,
    profile_completeness integer NOT NULL,
    is_active boolean NOT NULL,
    is_verified boolean NOT NULL,
    verified_at timestamp without time zone,
    is_contributor boolean NOT NULL,
    contributor_badge_awarded_at timestamp without time zone,
    filiere character varying,
    level public.studentlevel,
    student_id character varying,
    program character varying,
    academic_year character varying,
    date_of_birth date,
    gender public.gender,
    phone_number character varying,
    address character varying,
    preferred_language character varying,
    profile_picture_url character varying,
    onboarding_completed boolean NOT NULL,
    push_notifications_enabled boolean NOT NULL,
    email_digest_enabled boolean NOT NULL,
    notification_types json NOT NULL,
    is_rtl boolean NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hashed_password character varying NOT NULL,
    created_at timestamp without time zone NOT NULL,
    major_id uuid
);


--
-- Name: usermemory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usermemory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    memory_type character varying NOT NULL,
    content character varying NOT NULL,
    related_course_id uuid,
    related_document_id uuid,
    importance_score double precision NOT NULL,
    is_forgotten boolean NOT NULL,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: userprofile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.userprofile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    learning_speed public.learningspeed NOT NULL,
    preferred_style public.learningstyle NOT NULL,
    avg_quiz_time_seconds double precision NOT NULL,
    total_quizzes_taken integer NOT NULL,
    detection_confidence double precision NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: userstreak; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.userstreak (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    current_streak integer NOT NULL,
    longest_streak integer NOT NULL,
    last_activity_date timestamp without time zone,
    total_active_days integer NOT NULL,
    freeze_start timestamp without time zone,
    freeze_end timestamp without time zone,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: academic_assets academic_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_assets
    ADD CONSTRAINT academic_assets_pkey PRIMARY KEY (id);


--
-- Name: academicassetcache academicassetcache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academicassetcache
    ADD CONSTRAINT academicassetcache_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: contribution contribution_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contribution
    ADD CONSTRAINT contribution_pkey PRIMARY KEY (id);


--
-- Name: contributorrequest contributorrequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contributorrequest
    ADD CONSTRAINT contributorrequest_pkey PRIMARY KEY (id);


--
-- Name: course course_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course
    ADD CONSTRAINT course_pkey PRIMARY KEY (id);


--
-- Name: daily_goal daily_goal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_goal
    ADD CONSTRAINT daily_goal_pkey PRIMARY KEY (id);


--
-- Name: department department_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department
    ADD CONSTRAINT department_pkey PRIMARY KEY (id);


--
-- Name: documentannotation documentannotation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentannotation
    ADD CONSTRAINT documentannotation_pkey PRIMARY KEY (id);


--
-- Name: documentembedding documentembedding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentembedding
    ADD CONSTRAINT documentembedding_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (uuid);


--
-- Name: documentversion documentversion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentversion
    ADD CONSTRAINT documentversion_pkey PRIMARY KEY (id);


--
-- Name: establishment establishment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.establishment
    ADD CONSTRAINT establishment_pkey PRIMARY KEY (id);


--
-- Name: flashcard flashcard_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard
    ADD CONSTRAINT flashcard_pkey PRIMARY KEY (id);


--
-- Name: flashcarddeck flashcarddeck_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcarddeck
    ADD CONSTRAINT flashcarddeck_pkey PRIMARY KEY (id);


--
-- Name: learninginsight learninginsight_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learninginsight
    ADD CONSTRAINT learninginsight_pkey PRIMARY KEY (id);


--
-- Name: learningpathjob learningpathjob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learningpathjob
    ADD CONSTRAINT learningpathjob_pkey PRIMARY KEY (id);


--
-- Name: major major_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.major
    ADD CONSTRAINT major_pkey PRIMARY KEY (id);


--
-- Name: message message_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_pkey PRIMARY KEY (id);


--
-- Name: mindmap mindmap_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mindmap
    ADD CONSTRAINT mindmap_pkey PRIMARY KEY (id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);


--
-- Name: otptoken otptoken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otptoken
    ADD CONSTRAINT otptoken_pkey PRIMARY KEY (id);


--
-- Name: parent_chunks parent_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_chunks
    ADD CONSTRAINT parent_chunks_pkey PRIMARY KEY (id);


--
-- Name: question question_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question
    ADD CONSTRAINT question_pkey PRIMARY KEY (id);


--
-- Name: quizsession quizsession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizsession
    ADD CONSTRAINT quizsession_pkey PRIMARY KEY (id);


--
-- Name: ragsession ragsession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ragsession
    ADD CONSTRAINT ragsession_pkey PRIMARY KEY (id);


--
-- Name: readingprogress readingprogress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readingprogress
    ADD CONSTRAINT readingprogress_pkey PRIMARY KEY (id);


--
-- Name: study_session study_session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_session
    ADD CONSTRAINT study_session_pkey PRIMARY KEY (id);


--
-- Name: summary summary_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary
    ADD CONSTRAINT summary_pkey PRIMARY KEY (id);


--
-- Name: teacherprofile teacherprofile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacherprofile
    ADD CONSTRAINT teacherprofile_pkey PRIMARY KEY (id);


--
-- Name: teacherprofile teacherprofile_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacherprofile
    ADD CONSTRAINT teacherprofile_user_id_key UNIQUE (user_id);


--
-- Name: teacherverificationrequest teacherverificationrequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacherverificationrequest
    ADD CONSTRAINT teacherverificationrequest_pkey PRIMARY KEY (id);


--
-- Name: teacherverificationrequest teacherverificationrequest_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacherverificationrequest
    ADD CONSTRAINT teacherverificationrequest_user_id_key UNIQUE (user_id);


--
-- Name: topicknowledge topicknowledge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topicknowledge
    ADD CONSTRAINT topicknowledge_pkey PRIMARY KEY (id);


--
-- Name: documents uq_canonical_path; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT uq_canonical_path UNIQUE (canonical_path);


--
-- Name: academic_assets uq_doc_asset_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academic_assets
    ADD CONSTRAINT uq_doc_asset_type UNIQUE (document_uuid, asset_type);


--
-- Name: major uq_major_department_name_level; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.major
    ADD CONSTRAINT uq_major_department_name_level UNIQUE (department_id, name, level);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (id);


--
-- Name: usermemory usermemory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usermemory
    ADD CONSTRAINT usermemory_pkey PRIMARY KEY (id);


--
-- Name: userprofile userprofile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.userprofile
    ADD CONSTRAINT userprofile_pkey PRIMARY KEY (id);


--
-- Name: userstreak userstreak_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.userstreak
    ADD CONSTRAINT userstreak_pkey PRIMARY KEY (id);


--
-- Name: idx_assets_doc_uuid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_doc_uuid ON public.academic_assets USING btree (document_uuid);


--
-- Name: idx_assets_generated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_generated_at ON public.academic_assets USING btree (generated_at DESC);


--
-- Name: idx_assets_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_type ON public.academic_assets USING btree (asset_type);


--
-- Name: idx_docs_inflight; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_docs_inflight ON public.documents USING btree (upload_timestamp) WHERE (status = 'ingesting'::text);


--
-- Name: idx_docs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_docs_status ON public.documents USING btree (status);


--
-- Name: idx_docs_upload_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_docs_upload_ts ON public.documents USING btree (upload_timestamp DESC);


--
-- Name: idx_docs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_docs_user_id ON public.documents USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_flashcarddeck_doc_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flashcarddeck_doc_ids ON public.flashcarddeck USING gin (document_version_ids);


--
-- Name: idx_mindmap_doc_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mindmap_doc_ids ON public.mindmap USING gin (document_version_ids);


--
-- Name: idx_quizsession_doc_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quizsession_doc_ids ON public.quizsession USING gin (document_version_ids);


--
-- Name: idx_summary_doc_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_summary_doc_ids ON public.summary USING gin (document_version_ids);


--
-- Name: ix_academicassetcache_asset_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_academicassetcache_asset_type ON public.academicassetcache USING btree (asset_type);


--
-- Name: ix_academicassetcache_document_version_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_academicassetcache_document_version_id ON public.academicassetcache USING btree (document_version_id);


--
-- Name: ix_academicassetcache_is_stale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_academicassetcache_is_stale ON public.academicassetcache USING btree (is_stale);


--
-- Name: ix_academicassetcache_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_academicassetcache_profile ON public.academicassetcache USING btree (profile);


--
-- Name: ix_academicassetcache_target_lang; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_academicassetcache_target_lang ON public.academicassetcache USING btree (target_lang);


--
-- Name: ix_contribution_academic_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contribution_academic_year ON public.contribution USING btree (academic_year);


--
-- Name: ix_contribution_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contribution_course_id ON public.contribution USING btree (course_id);


--
-- Name: ix_contribution_course_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contribution_course_type ON public.contribution USING btree (course_type);


--
-- Name: ix_contribution_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contribution_created_at ON public.contribution USING btree (created_at);


--
-- Name: ix_contribution_is_demo_submission; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contribution_is_demo_submission ON public.contribution USING btree (is_demo_submission);


--
-- Name: ix_contribution_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contribution_language ON public.contribution USING btree (language);


--
-- Name: ix_contribution_quality_flag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contribution_quality_flag ON public.contribution USING btree (quality_flag);


--
-- Name: ix_contribution_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contribution_title ON public.contribution USING btree (title);


--
-- Name: ix_contribution_uploader_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contribution_uploader_id ON public.contribution USING btree (uploader_id);


--
-- Name: ix_contributorrequest_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contributorrequest_created_at ON public.contributorrequest USING btree (created_at);


--
-- Name: ix_contributorrequest_demo_contribution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_contributorrequest_demo_contribution_id ON public.contributorrequest USING btree (demo_contribution_id);


--
-- Name: ix_contributorrequest_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contributorrequest_status ON public.contributorrequest USING btree (status);


--
-- Name: ix_contributorrequest_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_contributorrequest_student_id ON public.contributorrequest USING btree (student_id);


--
-- Name: ix_course_academic_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_course_academic_year ON public.course USING btree (academic_year);


--
-- Name: ix_course_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_course_department_id ON public.course USING btree (department_id);


--
-- Name: ix_course_is_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_course_is_deleted ON public.course USING btree (is_deleted);


--
-- Name: ix_course_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_course_level ON public.course USING btree (level);


--
-- Name: ix_course_title; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_course_title ON public.course USING btree (title);


--
-- Name: ix_daily_goal_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_daily_goal_user_id ON public.daily_goal USING btree (user_id);


--
-- Name: ix_department_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_department_name ON public.department USING btree (name);


--
-- Name: ix_documentannotation_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentannotation_created_at ON public.documentannotation USING btree (created_at);


--
-- Name: ix_documentannotation_document_version_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentannotation_document_version_id ON public.documentannotation USING btree (document_version_id);


--
-- Name: ix_documentannotation_is_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentannotation_is_public ON public.documentannotation USING btree (is_public);


--
-- Name: ix_documentannotation_page_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentannotation_page_number ON public.documentannotation USING btree (page_number);


--
-- Name: ix_documentannotation_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentannotation_user_id ON public.documentannotation USING btree (user_id);


--
-- Name: ix_documentembedding_document_version_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentembedding_document_version_id ON public.documentembedding USING btree (document_version_id);


--
-- Name: ix_documentversion_contribution_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentversion_contribution_id ON public.documentversion USING btree (contribution_id);


--
-- Name: ix_documentversion_is_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentversion_is_deleted ON public.documentversion USING btree (is_deleted);


--
-- Name: ix_documentversion_sha256_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentversion_sha256_hash ON public.documentversion USING btree (sha256_hash);


--
-- Name: ix_documentversion_simhash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_documentversion_simhash ON public.documentversion USING btree (simhash);


--
-- Name: ix_establishment_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_establishment_domain ON public.establishment USING btree (domain);


--
-- Name: ix_establishment_is_authorized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_establishment_is_authorized ON public.establishment USING btree (is_authorized);


--
-- Name: ix_establishment_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_establishment_name ON public.establishment USING btree (name);


--
-- Name: ix_flashcard_deck_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_flashcard_deck_id ON public.flashcard USING btree (deck_id);


--
-- Name: ix_flashcard_next_review_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_flashcard_next_review_at ON public.flashcard USING btree (next_review_at);


--
-- Name: ix_flashcarddeck_share_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_flashcarddeck_share_token ON public.flashcarddeck USING btree (share_token);


--
-- Name: ix_flashcarddeck_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_flashcarddeck_student_id ON public.flashcarddeck USING btree (student_id);


--
-- Name: ix_learninginsight_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_learninginsight_user_id ON public.learninginsight USING btree (user_id);


--
-- Name: ix_learningpathjob_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_learningpathjob_created_at ON public.learningpathjob USING btree (created_at);


--
-- Name: ix_learningpathjob_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_learningpathjob_status ON public.learningpathjob USING btree (status);


--
-- Name: ix_learningpathjob_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_learningpathjob_updated_at ON public.learningpathjob USING btree (updated_at);


--
-- Name: ix_learningpathjob_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_learningpathjob_user_id ON public.learningpathjob USING btree (user_id);


--
-- Name: ix_major_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_major_department_id ON public.major USING btree (department_id);


--
-- Name: ix_major_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_major_level ON public.major USING btree (level);


--
-- Name: ix_major_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_major_name ON public.major USING btree (name);


--
-- Name: ix_message_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_message_session_id ON public.message USING btree (session_id);


--
-- Name: ix_mindmap_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_mindmap_student_id ON public.mindmap USING btree (student_id);


--
-- Name: ix_mindmap_target_lang; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_mindmap_target_lang ON public.mindmap USING btree (target_lang);


--
-- Name: ix_notification_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notification_user_id ON public.notification USING btree (user_id);


--
-- Name: ix_otptoken_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_otptoken_user_id ON public.otptoken USING btree (user_id);


--
-- Name: ix_question_is_correct; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_question_is_correct ON public.question USING btree (is_correct);


--
-- Name: ix_question_quiz_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_question_quiz_session_id ON public.question USING btree (quiz_session_id);


--
-- Name: ix_quizsession_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_quizsession_created_at ON public.quizsession USING btree (created_at);


--
-- Name: ix_quizsession_is_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_quizsession_is_completed ON public.quizsession USING btree (is_completed);


--
-- Name: ix_quizsession_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_quizsession_student_id ON public.quizsession USING btree (student_id);


--
-- Name: ix_ragsession_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ragsession_student_id ON public.ragsession USING btree (student_id);


--
-- Name: ix_readingprogress_document_version_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_readingprogress_document_version_id ON public.readingprogress USING btree (document_version_id);


--
-- Name: ix_readingprogress_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_readingprogress_user_id ON public.readingprogress USING btree (user_id);


--
-- Name: ix_study_session_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_study_session_user_id ON public.study_session USING btree (user_id);


--
-- Name: ix_summary_format; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_summary_format ON public.summary USING btree (format);


--
-- Name: ix_summary_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_summary_student_id ON public.summary USING btree (student_id);


--
-- Name: ix_summary_target_lang; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_summary_target_lang ON public.summary USING btree (target_lang);


--
-- Name: ix_teacherprofile_invite_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_teacherprofile_invite_token ON public.teacherprofile USING btree (invite_token);


--
-- Name: ix_teacherverificationrequest_requested_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_teacherverificationrequest_requested_department ON public.teacherverificationrequest USING btree (requested_department);


--
-- Name: ix_teacherverificationrequest_requested_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_teacherverificationrequest_requested_domain ON public.teacherverificationrequest USING btree (requested_domain);


--
-- Name: ix_teacherverificationrequest_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_teacherverificationrequest_status ON public.teacherverificationrequest USING btree (status);


--
-- Name: ix_topicknowledge_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_topicknowledge_course_id ON public.topicknowledge USING btree (course_id);


--
-- Name: ix_topicknowledge_topic_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_topicknowledge_topic_name ON public.topicknowledge USING btree (topic_name);


--
-- Name: ix_topicknowledge_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_topicknowledge_user_id ON public.topicknowledge USING btree (user_id);


--
-- Name: ix_user_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_user_email ON public."user" USING btree (email);


--
-- Name: ix_user_is_contributor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_is_contributor ON public."user" USING btree (is_contributor);


--
-- Name: ix_user_onboarding_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_onboarding_completed ON public."user" USING btree (onboarding_completed);


--
-- Name: ix_user_student_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_user_student_id ON public."user" USING btree (student_id);


--
-- Name: ix_usermemory_memory_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_usermemory_memory_type ON public.usermemory USING btree (memory_type);


--
-- Name: ix_usermemory_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_usermemory_user_id ON public.usermemory USING btree (user_id);


--
-- Name: ix_userprofile_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_userprofile_user_id ON public.userprofile USING btree (user_id);


--
-- Name: ix_userstreak_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_userstreak_user_id ON public.userstreak USING btree (user_id);


--
-- Name: academicassetcache academicassetcache_document_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.academicassetcache
    ADD CONSTRAINT academicassetcache_document_version_id_fkey FOREIGN KEY (document_version_id) REFERENCES public.documentversion(id) ON DELETE CASCADE;


--
-- Name: contribution contribution_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contribution
    ADD CONSTRAINT contribution_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.course(id);


--
-- Name: contribution contribution_uploader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contribution
    ADD CONSTRAINT contribution_uploader_id_fkey FOREIGN KEY (uploader_id) REFERENCES public."user"(id) ON DELETE SET NULL;


--
-- Name: contributorrequest contributorrequest_demo_contribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contributorrequest
    ADD CONSTRAINT contributorrequest_demo_contribution_id_fkey FOREIGN KEY (demo_contribution_id) REFERENCES public.contribution(id) ON DELETE CASCADE;


--
-- Name: contributorrequest contributorrequest_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contributorrequest
    ADD CONSTRAINT contributorrequest_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public."user"(id);


--
-- Name: contributorrequest contributorrequest_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contributorrequest
    ADD CONSTRAINT contributorrequest_student_id_fkey FOREIGN KEY (student_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: course course_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course
    ADD CONSTRAINT course_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.department(id) ON DELETE CASCADE;


--
-- Name: course course_major_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course
    ADD CONSTRAINT course_major_id_fkey FOREIGN KEY (major_id) REFERENCES public.major(id);


--
-- Name: daily_goal daily_goal_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_goal
    ADD CONSTRAINT daily_goal_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: department department_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department
    ADD CONSTRAINT department_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishment(id) ON DELETE CASCADE;


--
-- Name: documentannotation documentannotation_document_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentannotation
    ADD CONSTRAINT documentannotation_document_version_id_fkey FOREIGN KEY (document_version_id) REFERENCES public.documentversion(id);


--
-- Name: documentannotation documentannotation_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentannotation
    ADD CONSTRAINT documentannotation_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: documentembedding documentembedding_document_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentembedding
    ADD CONSTRAINT documentembedding_document_version_id_fkey FOREIGN KEY (document_version_id) REFERENCES public.documentversion(id);


--
-- Name: documentversion documentversion_contribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documentversion
    ADD CONSTRAINT documentversion_contribution_id_fkey FOREIGN KEY (contribution_id) REFERENCES public.contribution(id);


--
-- Name: flashcard flashcard_deck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcard
    ADD CONSTRAINT flashcard_deck_id_fkey FOREIGN KEY (deck_id) REFERENCES public.flashcarddeck(id) ON DELETE CASCADE;


--
-- Name: flashcarddeck flashcarddeck_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flashcarddeck
    ADD CONSTRAINT flashcarddeck_student_id_fkey FOREIGN KEY (student_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: learninginsight learninginsight_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learninginsight
    ADD CONSTRAINT learninginsight_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: learningpathjob learningpathjob_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learningpathjob
    ADD CONSTRAINT learningpathjob_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: major major_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.major
    ADD CONSTRAINT major_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.department(id) ON DELETE CASCADE;


--
-- Name: message message_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message
    ADD CONSTRAINT message_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.ragsession(id);


--
-- Name: mindmap mindmap_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mindmap
    ADD CONSTRAINT mindmap_student_id_fkey FOREIGN KEY (student_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: notification notification_contribution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_contribution_id_fkey FOREIGN KEY (contribution_id) REFERENCES public.contribution(id) ON DELETE SET NULL;


--
-- Name: notification notification_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: otptoken otptoken_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otptoken
    ADD CONSTRAINT otptoken_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: parent_chunks parent_chunks_document_uuid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parent_chunks
    ADD CONSTRAINT parent_chunks_document_uuid_fkey FOREIGN KEY (document_uuid) REFERENCES public.documents(uuid) ON DELETE CASCADE;


--
-- Name: question question_quiz_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question
    ADD CONSTRAINT question_quiz_session_id_fkey FOREIGN KEY (quiz_session_id) REFERENCES public.quizsession(id) ON DELETE CASCADE;


--
-- Name: quizsession quizsession_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quizsession
    ADD CONSTRAINT quizsession_student_id_fkey FOREIGN KEY (student_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: ragsession ragsession_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ragsession
    ADD CONSTRAINT ragsession_student_id_fkey FOREIGN KEY (student_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: readingprogress readingprogress_document_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readingprogress
    ADD CONSTRAINT readingprogress_document_version_id_fkey FOREIGN KEY (document_version_id) REFERENCES public.documentversion(id) ON DELETE CASCADE;


--
-- Name: readingprogress readingprogress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.readingprogress
    ADD CONSTRAINT readingprogress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: study_session study_session_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.study_session
    ADD CONSTRAINT study_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: summary summary_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.summary
    ADD CONSTRAINT summary_student_id_fkey FOREIGN KEY (student_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: teacherprofile teacherprofile_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacherprofile
    ADD CONSTRAINT teacherprofile_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.department(id) ON DELETE SET NULL;


--
-- Name: teacherprofile teacherprofile_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacherprofile
    ADD CONSTRAINT teacherprofile_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: teacherverificationrequest teacherverificationrequest_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacherverificationrequest
    ADD CONSTRAINT teacherverificationrequest_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishment(id);


--
-- Name: teacherverificationrequest teacherverificationrequest_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacherverificationrequest
    ADD CONSTRAINT teacherverificationrequest_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public."user"(id);


--
-- Name: teacherverificationrequest teacherverificationrequest_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacherverificationrequest
    ADD CONSTRAINT teacherverificationrequest_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: topicknowledge topicknowledge_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topicknowledge
    ADD CONSTRAINT topicknowledge_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.course(id);


--
-- Name: topicknowledge topicknowledge_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topicknowledge
    ADD CONSTRAINT topicknowledge_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: user user_establishment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_establishment_id_fkey FOREIGN KEY (establishment_id) REFERENCES public.establishment(id);


--
-- Name: user user_major_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT user_major_id_fkey FOREIGN KEY (major_id) REFERENCES public.major(id);


--
-- Name: usermemory usermemory_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usermemory
    ADD CONSTRAINT usermemory_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: userprofile userprofile_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.userprofile
    ADD CONSTRAINT userprofile_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- Name: userstreak userstreak_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.userstreak
    ADD CONSTRAINT userstreak_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id);


--
-- PostgreSQL database dump complete
--


