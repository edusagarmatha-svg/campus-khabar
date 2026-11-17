# Campus Kabar --- Project Guide

**Document type:** Product, architecture, and AI-agent working guide\
**Status:** Living source of truth --- update this document when an
approved decision changes\
**Project:** Campus Kabar\
**Version:** 1.0 (initial build guide)

------------------------------------------------------------------------

## 1. What We Are Building

Campus Kabar is a centralized campus publishing platform --- a digital
newspaper and content-management system for campus-related information.

The organization operating Campus Kabar publishes official campus news,
long-form articles, notices, announcements, event updates, photographs,
videos, posters, and other relevant media. Students, staff, parents, and
visitors can discover and read this content from one public website.

The product must be more than a simple notice board. It must support a
proper editorial publishing experience: an authorized content editor
should be able to write an article and place images, video embeds, and
other supported media **inside the body of the content**, in the
intended positions. Media should also be attachable as a cover image,
gallery, or downloadable attachment where appropriate.

### Core product idea

> One trusted, mobile-friendly place to publish, manage, discover, and
> read campus news, articles, notices, and multimedia content.

## 2. Product Goals

1.  Centralize official campus news, articles, notices, and
    announcements.
2.  Give authorized staff a straightforward way to create, edit, review,
    and publish content without needing technical help.
3.  Provide a rich editorial experience, including formatted text and
    inline multimedia.
4.  Make content easy to discover by content type, category, date, and
    keyword.
5.  Provide a clean, readable, mobile-first public experience.
6.  Keep the system maintainable, secure, and suitable for future
    growth.

## 3. Users, Roles, and Access

### Public visitor / reader

-   Can browse and read published content without creating an account.
-   Can search and filter public content.
-   Can browse categories and media galleries.
-   Cannot create, edit, or manage content.
-   No public registration or login is required for Version 1.

### Admin

-   Has full administrative control.
-   Can manage staff accounts and roles.
-   Can manage categories and platform-level settings.
-   Can create, edit, publish, unpublish, feature, archive, and delete
    content.
-   Can access the admin dashboard and content-management tools.

### Editor

-   Is an authorized staff member who creates and manages editorial
    content.
-   Can create and edit news, articles, notices, and announcements.
-   Can upload and insert supported media.
-   Can save drafts and publish content if that permission is granted.
-   Cannot manage admin accounts, roles, or sensitive platform settings
    unless explicitly granted.

**Access-control principle:** The public can read published content.
Only authenticated and authorized staff can access the
content-management area. Admin and editor permissions must be enforced
by the backend API, not merely hidden in the frontend.

The exact permission split between Admin and Editor can be refined, but
do not introduce public user accounts in Version 1 without an explicit
product decision.

## 4. Content Model and Publishing Concepts

Use one shared content model for the main publishing workflow, with a
field that identifies the content type.

### Content types

-   **News:** timely campus updates and reports.
-   **Article:** longer-form editorial or informational writing.
-   **Notice:** formal information such as exam schedules, deadlines,
    holidays, and administrative notices. Notices may have an expiry
    date.
-   **Announcement:** short official updates or communications.

These are content types, not topical categories. A post's type answers
"what kind of content is this?" A category answers "what topic is it
about?"

### Categories

Categories are managed by authorized staff and classify content by
topic. Initial suggested categories:

-   Exams and Results
-   Admissions
-   Events and Programs
-   Sports
-   Clubs and Student Activities
-   Achievements
-   Seminars and Workshops
-   Holidays and Calendar
-   General News

The list is configurable. Do not hard-code category names into
application logic.

### Publishing states

At minimum, support:

-   `draft` --- saved but not publicly visible.
-   `published` --- visible on the public portal.
-   `unpublished` --- removed from public visibility but retained in the
    system.

A future review/approval state may be added if the editorial workflow
requires it. Do not build a complex approval workflow without an
approved requirement.

### Important content fields

A content item should support:

-   Title
-   Unique URL slug
-   Short summary / excerpt
-   Rich-text body
-   Content type
-   Category
-   Author
-   Status
-   Cover image
-   Tags (if enabled)
-   Featured/pinned flag
-   Publication date/time
-   Optional expiry date/time (especially for notices)
-   Created and updated timestamps
-   Optional soft-delete timestamp

## 5. Rich Content Editor and Media

A central requirement is a rich content editor. It must not be limited
to a plain textarea or a list of attachments.

### Editor capabilities

The authoring interface should support:

-   Headings and paragraphs
-   Bold, italic, underline, and inline links
-   Ordered and unordered lists
-   Block quotes
-   Images inserted between paragraphs
-   Video embeds from approved providers (for example, YouTube)
-   Uploaded video where supported
-   Captions and alternative text for images
-   Poster and PDF attachments
-   Image galleries
-   Preview before publishing

**Preferred editor to evaluate:** TipTap for React. Editor.js is a
possible alternative, but choose one and keep the editor integration
maintainable.

Store editor content as structured JSON (for example, TipTap's document
JSON) in MySQL. The content structure should preserve the order and
placement of inline media. Store media metadata and storage URLs
separately; reference media records from the editor document where
appropriate.

Do not store large image/video binary files directly in MySQL. Use a
suitable file/object-storage service and keep file metadata and URLs in
the database.

### Initial media constraints from the product requirements

These are proposed limits and can be adjusted after selecting the
storage provider:

-   Images: JPG, PNG, or WebP; up to 5 MB each; up to 20 images per
    post.
-   Videos: uploaded MP4 or an embedded YouTube link; uploaded video up
    to 100 MB.
-   Posters: image or PDF; up to 10 MB per file.

Validate file size, extension, MIME type, and actual file content where
practical. Never trust the filename or browser-provided MIME type alone.
Restrict embedded media to approved providers and validate URLs.

## 6. Version 1 Scope

### Public website

-   Home page with featured/pinned content and latest content.
-   News and article listing pages.
-   Notice and announcement listing/section.
-   Content detail page with rich body content and media.
-   Category browsing.
-   Search by keyword.
-   Filters by content type, category, and date where relevant.
-   Media gallery for recent photos/videos.
-   Responsive layout for phones, tablets, and desktops.
-   Public reading without registration.

### Staff/admin application

-   Secure staff login.
-   Role-based admin/editor access.
-   Dashboard with useful content counts and recent activity.
-   Create and edit content.
-   Rich-text editing with inline media.
-   Upload and manage media.
-   Save drafts, publish, and unpublish.
-   Feature/pin important content.
-   Manage content list with search, filters, and sorting.
-   Manage categories (Admin).
-   Manage staff accounts and roles (Admin).

### Not included unless separately approved

-   Public registration and reader accounts.
-   Comments, likes, and user-generated submissions.
-   Native Android or iOS applications.
-   Push, email, or SMS notifications.
-   Multiple languages.
-   Complex editorial approval chains.
-   Multi-campus tenancy or campus-specific data isolation.

Do not quietly add out-of-scope features. Record proposed additions as
decisions for approval.

## 7. Technology Stack

Use the following stack unless a technical constraint is discovered and
discussed before changing it.

  -----------------------------------------------------------------------
  Layer                   Technology              Responsibility
  ----------------------- ----------------------- -----------------------
  Frontend                React (JavaScript)      Public portal and
                                                  staff/admin interface

  Backend                 Node.js + Express       REST API,
                                                  authentication,
                                                  authorization, business
                                                  rules

  Database                MySQL 8                 Users, content,
                                                  categories, media
                                                  metadata, tags

  Database driver         `mysql2`                MySQL connection pool
                                                  and parameterized
                                                  queries

  Rich-text editor        TipTap (preferred)      Structured editorial
                                                  content and inline
                                                  media

  Media storage           Cloudinary or suitable  Image, video, and
                          object storage          document files

  Authentication          JWT + bcrypt (or        Staff authentication
                          Argon2)                 and password hashing

  Styling                 Tailwind CSS (optional) Consistent responsive
                                                  UI

  Version control         Git + GitHub            Source control and
                                                  collaboration
  -----------------------------------------------------------------------

Use JavaScript rather than TypeScript for the initial implementation
unless we explicitly decide otherwise.

Use environment variables for secrets and configuration. Never commit
`.env` files or credentials.

## 8. High-Level Architecture

Use a clear separation of responsibilities:

1.  **React client:** renders public pages and protected staff/admin
    pages.
2.  **Express API:** validates requests, authenticates staff, checks
    permissions, applies business rules, and returns JSON.
3.  **MySQL:** stores relational application data and structured editor
    JSON.
4.  **Media storage:** stores uploaded files; MySQL stores their
    metadata and references.
5.  **External media embeds:** render only approved and validated embed
    providers.

The frontend must not connect directly to MySQL. All database access
goes through the backend API.

Keep the backend organized by responsibility (routes, controllers,
services, middleware, database, validators, and configuration). Avoid
putting the entire application into one file. Do not over-engineer with
microservices.

## 9. Initial Database Design

Design and review an ER diagram before implementing the schema. The
following is the proposed starting model, not permission to generate
every table immediately.

### `users`

Staff accounts only.

Suggested fields: `id`, `name`, `email` (unique), `password_hash`,
`role` (`admin` or `editor`), `created_at`, `updated_at`, and optional
`is_active`.

### `categories`

Suggested fields: `id`, `name`, `slug` (unique), `description`,
`created_at`, `updated_at`.

### `posts`

Suggested fields:

-   `id`
-   `title`
-   `slug` (unique)
-   `summary`
-   `content` (MySQL JSON for structured rich-text content)
-   `post_type` (`news`, `article`, `notice`, `announcement`)
-   `category_id` (foreign key)
-   `author_id` (foreign key to users)
-   `status` (`draft`, `published`, `unpublished`)
-   `is_featured`
-   `published_at`
-   `expires_at` (nullable)
-   `created_at`
-   `updated_at`
-   `deleted_at` (nullable; soft deletion if adopted)

### `media`

Suggested fields: `id`, `media_type` (`image`, `video`, `document`),
`source_type` (`upload`, `external`), `file_url`, `file_name`,
`mime_type`, `file_size`, `created_at`, and optional uploader/storage
metadata.

### `post_media`

Join table connecting posts and media. Suggested fields: `id`,
`post_id`, `media_id`, `usage_type` (`cover`, `gallery`, `inline`,
`attachment`), and `sort_order`.

The rich-text document should preserve the exact position of inline
media. Avoid relying only on a separate unordered attachment list for
inline content.

### `tags` and `post_tags`

Optional tagging support:

-   `tags`: `id`, `name`, `slug`.
-   `post_tags`: `post_id`, `tag_id`, with a composite primary key.

### Relationships

-   One user can author many posts.
-   One category can contain many posts.
-   A post can reference multiple media records.
-   A media record may be reused by multiple posts if reuse is
    supported.
-   Posts and tags have a many-to-many relationship.

Use foreign keys, appropriate indexes, unique constraints, and sensible
deletion rules. Add indexes for common public queries such as
publication status/date, category, content type, and slug.

Do not add a `campuses` table or `campus_id` until single-campus versus
multi-campus operation has been decided. Do not assume a tenancy model.

## 10. Security and Quality Requirements

Security is part of the implementation, not a final polish task.

-   Hash passwords with bcrypt or Argon2. Never store plaintext
    passwords.
-   Protect staff routes with authentication middleware.
-   Enforce role permissions on the server for every protected
    operation.
-   Validate and sanitize all user input.
-   Use parameterized SQL queries; never build SQL by concatenating
    untrusted input.
-   Configure CORS deliberately.
-   Add rate limiting to login and other sensitive endpoints.
-   Use secure token handling. If using cookie-based authentication,
    configure HttpOnly, Secure, SameSite, and CSRF protections
    appropriately.
-   Validate uploads by size, allowed type, MIME, and content where
    practical.
-   Keep secrets in environment variables.
-   Avoid exposing stack traces or sensitive server details to public
    clients.
-   Use HTTPS in production.
-   Back up the database and uploaded media.
-   Make the public site responsive and usable on common modern
    browsers.
-   Optimize images and avoid unnecessarily large assets.
-   Paginate listing APIs; do not return every post at once.
-   Show useful loading, empty, success, and error states in the UI.

## 11. API Design Direction

Build a REST API with consistent naming and response shapes. The exact
endpoints should be designed before implementation.

Likely resource groups:

-   `/api/auth` --- staff login/logout/current-user.
-   `/api/posts` --- public published content and protected content
    management.
-   `/api/categories` --- public category listing and protected
    management.
-   `/api/media` --- protected upload and media management.
-   `/api/tags` --- tag management if included.
-   `/api/admin/dashboard` --- dashboard summaries.
-   `/api/admin/users` --- staff account and role management.

Separate public read endpoints from protected management actions where
that improves clarity. Public APIs must never return drafts or
unpublished content.

Support pagination, filtering, sorting, and predictable validation
errors.

## 12. Suggested Development Milestones

Build incrementally. Each milestone should be implemented, run, tested,
reviewed, and committed before moving on.

### Milestone 0 --- Confirm the plan

-   Read this guide and the original product requirements.
-   Identify unresolved decisions.
-   Propose the architecture and ER diagram.
-   Do not write application code yet.

### Milestone 1 --- Project foundation

-   Create the repository and project structure.
-   Add README, `.gitignore`, environment example, and setup
    instructions.
-   Initialize React and Express in a clear structure.
-   Confirm both development servers run.

### Milestone 2 --- Database foundation

-   Finalize the ER diagram and schema.
-   Create MySQL database and tables using migrations or versioned SQL.
-   Configure a `mysql2` connection pool.
-   Test the connection and basic queries.

### Milestone 3 --- Staff authentication and authorization

-   Create the first Admin account securely.
-   Implement login and current-user handling.
-   Add authentication and role middleware.
-   Test unauthorized and forbidden requests.

### Milestone 4 --- Content API

-   Implement categories and posts.
-   Add draft/publish/unpublish behavior.
-   Add public listing, detail, search, filters, and pagination.
-   Test that unpublished content is never publicly accessible.

### Milestone 5 --- Media and rich-text authoring

-   Integrate the selected rich-text editor.
-   Implement media storage and upload validation.
-   Support cover, gallery, inline media, video embeds, and attachments.
-   Preserve inline media placement when saving and rendering content.

### Milestone 6 --- Staff/admin interface

-   Build login, dashboard, content list, editor, media controls,
    category management, and staff management.
-   Enforce permissions in both UI and API.

### Milestone 7 --- Public portal

-   Build home, listing, category, search/filter, detail, and media
    gallery pages.
-   Ensure responsive layouts and accessible reading experience.

### Milestone 8 --- Testing, hardening, and deployment

-   Test important user flows and edge cases.
-   Review security, performance, backups, and error handling.
-   Configure production environment and deploy.
-   Document setup, deployment, and maintenance.

## 13. Working Rules for the AI Coding Agent

This section is important. Follow it throughout the project.

1.  **Read this file first** before proposing or changing project
    architecture.
2.  Treat this document as the current project source of truth. If a
    user gives a newer explicit decision, update the relevant section
    and explain the change.
3.  Do not build the entire application in one prompt or make large
    unrelated changes.
4.  Work on one small, clearly defined task at a time.
5.  Before coding a milestone, explain the plan, files likely to change,
    dependencies, and important trade-offs. Wait for approval when the
    task involves architecture, schema, security, or a significant
    dependency.
6.  Do not silently invent requirements. Ask one focused question when a
    missing decision blocks correct implementation. Otherwise record the
    assumption and keep it reversible.
7.  Do not change the selected stack without explaining why and getting
    approval.
8.  Do not add public registration, comments, likes, notifications,
    multi-campus tenancy, or other out-of-scope features without
    approval.
9.  Prefer readable, maintainable code over clever abstractions or
    unnecessary complexity.
10. Use JavaScript and explain unfamiliar Node.js, Express, SQL, React,
    and security concepts when they appear.
11. Do not pretend code has been tested. Run relevant checks where
    possible and report exactly what passed, failed, or could not be
    run.
12. Never delete or overwrite existing work without explaining the
    impact and getting approval.
13. Do not expose, print, commit, or request secrets. Never include real
    credentials in generated files.
14. Use parameterized SQL and validate all inputs.
15. Add or update tests for important behavior.
16. After each task, summarize:
    -   What changed
    -   Which files changed
    -   Why the implementation works
    -   Commands to run
    -   How to test it manually
    -   Any known limitations or next step
17. Keep documentation current when architecture, schema, setup, or
    workflow decisions change.
18. Do not create placeholder features that appear complete but do not
    work. Clearly label unfinished functionality.

### Preferred interaction pattern

For each task:

1.  **Understand:** inspect relevant files and explain the current
    state.
2.  **Plan:** propose the smallest safe implementation.
3.  **Approve:** wait for approval for significant changes.
4.  **Implement:** make only the agreed changes.
5.  **Verify:** run tests, linting, or manual checks that are available.
6.  **Explain:** teach the user what changed and how the code works.
7.  **Commit:** suggest a clear Git commit message after the user
    verifies the result.

## 14. Decisions Still to Confirm

Do not guess these:

-   Is Campus Kabar for one campus/organization only, or should it
    support multiple campuses in the future?
-   Can Editors publish directly, or must an Admin approve their drafts?
-   Which language will Version 1 use?
-   Which media storage provider and hosting environment will be used?
-   Should uploaded videos be stored directly, or should Version 1
    prefer external video embeds?
-   Are tags required in the first release, or can they wait?

Where a decision does not block the current milestone, record it and
continue without prematurely implementing it.

## 15. Definition of a Successful Version 1

Version 1 is successful when:

-   A public visitor can open Campus Kabar and read published news,
    articles, notices, and announcements without logging in.
-   Visitors can find content through categories, search, and relevant
    filters.
-   An authorized staff member can log in and create a rich content
    item.
-   The editor can place images and supported video inside the body, not
    only attach them at the end.
-   Staff can save drafts, publish, edit, unpublish, and feature content
    according to their permissions.
-   Notices can have optional expiry dates.
-   Admins can manage categories and staff access.
-   The API protects private management operations and never exposes
    drafts publicly.
-   The application is responsive, reasonably fast, documented, and
    deployable.
-   The user understands the main parts of the codebase and can run the
    project locally.

------------------------------------------------------------------------

**Final instruction to the AI agent:** Start with Milestone 0. Read this
document, inspect any supplied product requirements, identify conflicts
or unresolved decisions, and propose the architecture and ER diagram. Do
not generate the full application or start coding until the plan is
reviewed.
