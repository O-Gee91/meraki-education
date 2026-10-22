CREATE OR REPLACE FUNCTION public.list_staff()
RETURNS TABLE(id uuid, full_name text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.id, p.full_name, p.email
  FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('teacher','admin') AND public.is_staff()
  ORDER BY p.full_name;
$$;
GRANT EXECUTE ON FUNCTION public.list_staff() TO authenticated;