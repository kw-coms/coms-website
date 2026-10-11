-- Comment and reply notifications on anonymous-board posts used to name the commenter:
-- the actor's student ID was stored and the message began with their real name, so the
-- post's author (or the parent comment's author) could read who had written "anonymously".
-- New notifications are written without either (NotificationService); this removes them from
-- the rows that already exist, including those whose post has since been deleted.
--
-- Only identity is removed. The row, its recipient, read state and link to the post stay, so
-- nobody's notification list changes length or order.
UPDATE notifications n
SET actor_student_id = NULL,
    actor_label = NULL,
    message = CASE n.type
        WHEN 'COMMENT_ON_POST' THEN '내 익명 글에 새 댓글이 달렸습니다.'
        ELSE '익명 게시판의 내 댓글에 새 답글이 달렸습니다.'
    END
WHERE n.type IN ('COMMENT_ON_POST', 'REPLY_ON_COMMENT')
  AND (
      EXISTS (
          SELECT 1 FROM community_posts p
          WHERE p.id = n.post_id AND p.category = 'ANONYMOUS'
      )
      OR EXISTS (
          SELECT 1 FROM deleted_community_posts d
          WHERE d.original_post_id = n.post_id AND d.category = 'ANONYMOUS'
      )
  );
