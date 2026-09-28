-- This migration is only for nu-pogodi-motion, never DrQuizman.
create table public.np_rooms (
 id text primary key, host_hash text not null, phone_hash text not null,
 owner_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '24 hours'
);
create table public.np_members (
 room_id text not null references public.np_rooms(id) on delete cascade,
 role text not null check(role in ('host','phone')),
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(room_id,role)
);
alter table public.np_rooms enable row level security;
alter table public.np_members enable row level security;
revoke all on public.np_rooms,public.np_members from anon,authenticated;
create or replace function public.np_create_room() returns jsonb
language plpgsql security definer set search_path='' as $$
declare rid text; hk text; pk text;
begin
 if auth.uid() is null then raise exception 'login required'; end if;
 delete from public.np_rooms where expires_at<now();
 if (select count(*) from public.np_rooms where owner_id=auth.uid())>=5 then raise exception 'room limit'; end if;
 if (select count(*) from public.np_rooms)>=200 then raise exception 'server full'; end if;
 rid=encode(extensions.gen_random_bytes(12),'hex');
 hk=encode(extensions.gen_random_bytes(24),'hex');pk=encode(extensions.gen_random_bytes(24),'hex');
 insert into public.np_rooms(id,host_hash,phone_hash,owner_id) values(rid,encode(extensions.digest(hk,'sha256'),'hex'),encode(extensions.digest(pk,'sha256'),'hex'),auth.uid());
 return jsonb_build_object('id',rid,'hostKey',hk,'joinKey',pk);
end $$;
create or replace function public.np_join_room(room_id text, player_role text, room_key text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.np_rooms;
begin
 if auth.uid() is null or player_role not in ('host','phone') then return false; end if;
 select * into r from public.np_rooms where id=room_id and expires_at>now();
 if not found then return false; end if;
 if encode(extensions.digest(room_key,'sha256'),'hex') <> (case when player_role='host' then r.host_hash else r.phone_hash end) then return false; end if;
 insert into public.np_members(room_id,role,user_id) values(room_id,player_role,auth.uid())
 on conflict on constraint np_members_pkey do update set user_id=excluded.user_id;
 return true;
end $$;
create or replace function public.np_channel_access(topic text,writing boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.np_members m join public.np_rooms r on r.id=m.room_id
 where m.user_id=auth.uid() and r.expires_at>now()
 and topic in ('np:'||r.id||':host','np:'||r.id||':phone')
 and (not writing or topic='np:'||r.id||':'||m.role));
$$;
revoke all on function public.np_create_room(), public.np_join_room(text,text,text),public.np_channel_access(text,boolean) from public,anon;
grant execute on function public.np_create_room(),public.np_join_room(text,text,text),public.np_channel_access(text,boolean) to authenticated;
create policy np_read_channel on realtime.messages for select to authenticated
 using(extension='broadcast' and public.np_channel_access((select realtime.topic()),false));
create policy np_write_channel on realtime.messages for insert to authenticated
 with check(extension='broadcast' and public.np_channel_access((select realtime.topic()),true));
