-- I-159: add a sixth report reason so a data subject can exercise their Art. 21 GDPR right to
-- object from the page their data is on, instead of having to file it as "Other / illegal content"
-- (which framed someone's own privacy right as an accusation of illegality).
--
-- reporter_email already exists on this table, so no new column is needed. The form makes it
-- required for this reason only: Art. 12(6) permits requesting further information where there are
-- reasonable doubts about the identity of the requester, and an anonymous form with no reply
-- address is reasonable doubt by construction.

alter table reports drop constraint reports_reason_check;

alter table reports add constraint reports_reason_check
  check (reason = any (array[
    'incorrect_info',
    'spam_fake',
    'copyright',
    'inappropriate_photo',
    'illegal_other',
    'privacy_objection'
  ]));
