create table public.np_stats (
 id boolean primary key default true check (id),
 games bigint not null default 0, caught bigint not null default 0, broken bigint not null default 0
);
insert into public.np_stats(id) values(true);
create table public.np_stat_runs (
 id uuid primary key, room_id text not null,
 caught integer not null default 0, broken integer not null default 0
);
alter table public.np_stats enable row level security;
alter table public.np_stat_runs enable row level security;
revoke all on public.np_stats,public.np_stat_runs from anon,authenticated;

create function public.np_get_stats() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('games',games,'caught',caught,'broken',broken) from public.np_stats where id;
$$;

-- Absolute, monotonic snapshots make retries and reordered requests harmless.
create function public.np_report_stats(run_id uuid, room_id text, host_key text, caught integer, broken integer) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare previous public.np_stat_runs; next_caught integer; next_broken integer;
begin
 if auth.uid() is null then raise exception 'login required'; end if;
 if run_id is null or caught is null or broken is null or caught<0 or caught>100000 or broken<0 or broken>3 then raise exception 'invalid score'; end if;
 if not exists(select 1 from public.np_rooms r where r.id=room_id and r.expires_at>now()
   and r.host_hash=encode(extensions.digest(host_key,'sha256'),'hex')) then raise exception 'invalid host'; end if;
 -- Serialize the small aggregate update, including the first report for a run.
 perform 1 from public.np_stats where id for update;
 select * into previous from public.np_stat_runs r where r.id=run_id;
 if found and previous.room_id<>room_id then raise exception 'wrong room'; end if;
 next_caught=greatest(coalesce(previous.caught,0),caught);
 next_broken=greatest(coalesce(previous.broken,0),broken);
 update public.np_stats set
  games=games+case when coalesce(previous.caught,0)=0 and next_caught>0 then 1 else 0 end,
  caught=np_stats.caught+next_caught-coalesce(previous.caught,0),
  broken=np_stats.broken+next_broken-coalesce(previous.broken,0) where id;
 insert into public.np_stat_runs(id,room_id,caught,broken) values(run_id,room_id,next_caught,next_broken)
 on conflict(id) do update set caught=excluded.caught,broken=excluded.broken;
 return public.np_get_stats();
end $$;
revoke all on function public.np_get_stats(),public.np_report_stats(uuid,text,text,integer,integer) from public,anon;
grant execute on function public.np_get_stats() to anon,authenticated;
grant execute on function public.np_report_stats(uuid,text,text,integer,integer) to authenticated;
