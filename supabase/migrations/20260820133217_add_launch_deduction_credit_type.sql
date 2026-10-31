
ALTER TABLE public.credit_transactions
DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions
ADD CONSTRAINT credit_transactions_type_check
CHECK (type = ANY (ARRAY[
  'purchase'::text,
  'hot_lead_deduction'::text,
  'sms_deduction'::text,
  'adjustment'::text,
  'refund'::text,
  'launch_deduction'::text
]));
