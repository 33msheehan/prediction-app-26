CREATE TABLE "forecast_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"forecast_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"tree" jsonb NOT NULL,
	"headline_p" double precision NOT NULL,
	"headline_se" double precision NOT NULL,
	"trials" integer NOT NULL,
	"source" text NOT NULL,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"question_type" text DEFAULT 'binary' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"cadence_kind" text DEFAULT 'none' NOT NULL,
	"cadence_interval" integer,
	"cadence_dates" jsonb,
	"current_version_id" uuid,
	"resolved_outcome" boolean,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "forecast_versions" ADD CONSTRAINT "forecast_versions_forecast_id_forecasts_id_fk" FOREIGN KEY ("forecast_id") REFERENCES "public"."forecasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_current_version_id_forecast_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."forecast_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_versions_forecast_version_idx" ON "forecast_versions" USING btree ("forecast_id","version_no");--> statement-breakpoint
CREATE INDEX "forecasts_user_status_idx" ON "forecasts" USING btree ("user_id","status");