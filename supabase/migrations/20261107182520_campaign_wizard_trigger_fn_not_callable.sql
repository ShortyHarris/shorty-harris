-- log_campaign_edit() is a trigger function; nobody needs to call it through the API.
revoke execute on function public.log_campaign_edit() from authenticated;
