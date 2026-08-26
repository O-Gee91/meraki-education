-- 1. Comments may only be posted on content the author can actually see
DROP POLICY IF EXISTS "comments insert" ON public.post_comments;
CREATE POLICY "comments insert" ON public.post_comments
FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_comments.post_id
      AND (
        (p.class_id IS NOT NULL AND public.can_view_class(p.class_id))
        OR (p.group_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.groups g
              WHERE g.id = p.group_id
                AND (g.visibility = 'school' OR public.is_staff()
                     OR EXISTS (SELECT 1 FROM public.group_members gm
                                WHERE gm.group_id = g.id AND gm.user_id = auth.uid()))
            ))
      )
  )
);

-- 2. Storage writes must follow an authorized path in the private bucket
DROP POLICY IF EXISTS "school_files_insert" ON storage.objects;
CREATE POLICY "school_files_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'school-files'
  AND owner = auth.uid()
  AND (
    -- assignment submission attachments: assignments/<assignment_id>/<student_id>/<file>
    (
      array_length(storage.foldername(name), 1) = 3
      AND (storage.foldername(name))[1] = 'assignments'
      AND (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND (storage.foldername(name))[3] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND public.can_view_student(((storage.foldername(name))[3])::uuid)
      AND EXISTS (
        SELECT 1 FROM public.assignments a
        WHERE a.id = ((storage.foldername(name))[2])::uuid
          AND public.can_view_class(a.class_id)
      )
    )
    -- library uploads: <school|class_id>/<uploader_id>/<file>
    OR (
      array_length(storage.foldername(name), 1) = 2
      AND (storage.foldername(name))[2] = auth.uid()::text
      AND (
        (storage.foldername(name))[1] = 'school'
        OR (
          (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND public.can_view_class(((storage.foldername(name))[1])::uuid)
        )
      )
    )
  )
);