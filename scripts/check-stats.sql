-- Run with Supabase db query --linked --file; all test changes roll back.
begin;
select set_config('request.jwt.claim.sub',(select id::text from auth.users limit 1),true);
do $$
declare room jsonb; baseline jsonb; result jsonb; run uuid=gen_random_uuid();
begin
 baseline=public.np_get_stats();room=public.np_create_room();
 result=public.np_report_stats(run,room->>'id',room->>'hostKey',0,1);
 assert (result->>'games')::bigint=(baseline->>'games')::bigint,'zero catches must not count a game';
 assert (result->>'broken')::bigint=(baseline->>'broken')::bigint+1,'miss counted immediately';
 result=public.np_report_stats(run,room->>'id',room->>'hostKey',1,1);
 assert (result->>'games')::bigint=(baseline->>'games')::bigint+1,'first catch counts game';
 result=public.np_report_stats(run,room->>'id',room->>'hostKey',5,2);
 result=public.np_report_stats(run,room->>'id',room->>'hostKey',5,2);
 result=public.np_report_stats(run,room->>'id',room->>'hostKey',1,0);
 assert (result->>'caught')::bigint=(baseline->>'caught')::bigint+5,'retries and stale reports must not duplicate or subtract';
 assert (result->>'broken')::bigint=(baseline->>'broken')::bigint+2;
 assert (result->>'games')::bigint=(baseline->>'games')::bigint+1;
 result=public.np_report_stats(gen_random_uuid(),room->>'id',room->>'hostKey',1,0);
 assert (result->>'games')::bigint=(baseline->>'games')::bigint+2,'new run counts separately';
 begin
  perform public.np_report_stats(run,room->>'id',room->>'joinKey',9,3);
  raise exception 'phone must not write stats';
 exception when raise_exception then
  if sqlerrm<>'invalid host' then raise; end if;
 end;
 assert not has_table_privilege('anon','public.np_stats','UPDATE');
 assert not has_function_privilege('anon','public.np_report_stats(uuid,text,text,integer,integer)','EXECUTE');
end $$;
rollback;
