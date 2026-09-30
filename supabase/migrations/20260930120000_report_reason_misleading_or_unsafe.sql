-- Add a seventh report reason for misleading claims or safety concerns. The Terms (new section 4,
-- "Listings are not endorsements") point people to the Report button when a listing seems
-- misleading or unsafe, and until now the only fitting option was "Other / illegal content", which
-- framed a safety concern as an accusation of illegality. Same problem I-159 fixed for privacy
-- objections. Offered on every entity type: a profile bio can make claims just as an event can.

alter table reports drop constraint reports_reason_check;

alter table reports add constraint reports_reason_check
  check (reason = any (array[
    'incorrect_info',
    'spam_fake',
    'copyright',
    'inappropriate_photo',
    'misleading_or_unsafe',
    'illegal_other',
    'privacy_objection'
  ]));
