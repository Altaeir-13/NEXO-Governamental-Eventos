export interface EventSettings {
 id: string; slug: string; title: string; description: string; city: string; event_date: string; date_confirmed: number;
 checkin_time: string; start_time: string; venue: string; auditorium: string; venue_confirmed: number; address: string;
 latitude: number; longitude: number; capacity: number; registration_open: number; registration_starts: string | null; registration_ends: string | null;
 certificate_hours: number; certificates_released: number; certificate_available_at: string; certificate_rules_approved: number;
 certificate_text: string; signatories: string; contact_email: string; contact_url: string; instagram_url: string;
 venue_description: string; venue_photo_url: string; venue_photo_authorized: number; venue_photo_alt: string; venue_photo_credit: string; venue_photo_source_url: string;
 privacy_text: string; retention_days: number;
}
export interface Speaker {
 id: string; event_id: string; name: string; role: string; bio: string; photo_url: string; area: string; institution: string; social_url: string;
 invitation_status: string; published: number; display_order: number; credentials_verified: number; bio_approved: number;
 talk_title: string; talk_summary: string; talk_approved: number; photo_authorized: number; photo_credit: string; participation_time: string | null;
}
export interface ScheduleItem { id: string; event_id: string; title: string; description: string; start_time: string | null; end_time: string | null; time_label: string; speaker_id: string | null; display_order: number; published: number; special: number }
export interface PublicEvent { event: EventSettings; schedule: ScheduleItem[]; speakers: Speaker[]; remaining: number }
export interface Participant { id: string; participant_id: string; name: string; email: string; institution: string; course: string; code: string; status: string; created_at: string; checked_in_at: string | null; certificate_eligible: number; certificate_code: string | null; certificate_status: string | null }
export interface Ticket { id: string; code: string; token: string; name: string; status: string; checked_in_at: string | null; event: EventSettings; certificate: { code: string; status: string } | null }
export interface AdminSession { user: { id: string; email: string; name: string; role: string }; csrf: string }
