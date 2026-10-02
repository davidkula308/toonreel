<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- AI calls live in src/lib/ai.server.ts (text via Responses, video via /v1/videos jobs); client calls them only through src/lib/studio.functions.ts — keeps keys server-side.
- Generated clips and uploads are stored in the private `media` bucket under `{userId}/...` and shown via signed URLs — owner-only access.
