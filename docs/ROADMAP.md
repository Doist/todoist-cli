# Todoist CLI Roadmap

Features not yet implemented, organized by priority.

## Tier 2 - Power User Features

| Feature          | API      | Notes                                   |
| ---------------- | -------- | --------------------------------------- |
| Reminders        | Sync API | Time-based and location-based reminders |
| Filters          | Sync API | Custom saved filter views               |
| Task duration    | REST API | `duration`, `duration_unit` params      |
| Task deadline    | REST API | `deadline_date` separate from due       |
| Shared labels    | REST API | List/rename/remove shared labels        |
| Comment update   | REST API | Edit existing comments                  |
| Project comments | REST API | Comments on projects (not just tasks)   |

## Tier 3 - Advanced/Optional

| Feature             | API       | Notes                           |
| ------------------- | --------- | ------------------------------- |
| Templates           | Sync API  | Import/export project templates |
| Backups             | Sync API  | List and download backups       |
| File uploads        | Sync API  | Attach files to comments        |
| User settings       | Sync API  | View/update preferences         |
| Karma/stats         | Sync API  | Productivity tracking           |
| Webhooks            | REST/Sync | Create webhook subscriptions    |
| Comment attachments | REST API  | File attachments on comments    |

## API Notes

- REST API v2 being deprecated February 2026, migrating to v1
- Reminders and Filters require Sync API (different patterns)
- Some features require Pro/Business plan
