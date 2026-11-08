import { z } from 'zod'
import { parseDuration } from '../../lib/duration.js'
import { CliError } from '../../lib/errors.js'

/** How many problems an error message lists before summarising the rest. */
const MAX_LISTED_PROBLEMS = 10

const optionalText = z.string().trim().min(1, 'must not be empty').optional()

/**
 * One task in the `td task add-many` input. The keys mirror the `td task add`
 * flags, so a task here means the same as the equivalent `td task add` call.
 * The descriptions are what `td task add-many --schema` prints.
 */
const TaskInputSchema = z
    .strictObject({
        content: z.string().trim().min(1, 'must not be empty').meta({ description: 'Task name.' }),
        description: z.string().optional().meta({ description: 'Task description (Markdown).' }),
        due: optionalText.meta({
            description:
                'Due date: YYYY-MM-DD or simple natural language ("tomorrow", "every friday").',
        }),
        deadline: z.iso
            .date('expected a date as YYYY-MM-DD')
            .optional()
            .meta({ description: 'Deadline date, YYYY-MM-DD.' }),
        priority: z
            .string()
            .regex(/^[pP][1-4]$/, 'expected p1, p2, p3 or p4')
            .optional()
            .meta({ description: 'Priority, p1 (highest) to p4 (lowest).' }),
        labels: z
            .array(z.string())
            .optional()
            .meta({ description: 'Label names, with or without a leading @.' }),
        duration: z
            .string()
            .refine(
                (value) => parseDuration(value) !== null,
                'expected a duration such as 30m, 1h or 2h15m',
            )
            .optional()
            .meta({ description: 'Duration, such as 30m, 1h or 2h15m.' }),
        assignee: optionalText.meta({
            description:
                'Assignee: "me", a collaborator name or email, or id:xxx. Needs --project.',
        }),
        section: optionalText.meta({
            description:
                'Section name, reused if the project has one by that name (ignoring case) and created otherwise; or id:xxx. Top-level tasks only. Needs --project.',
        }),
        get subtasks() {
            return z
                .array(TaskInputSchema)
                .optional()
                .meta({ description: "Subtasks, in the parent's project and section." })
        },
    })
    .meta({ id: 'task', description: 'A task to create.' })

const TaskListSchema = z
    .array(TaskInputSchema)
    .min(1, 'expected at least one task')
    .meta({ description: 'The tasks for td task add-many to create, in order.' })

export type TaskInput = z.infer<typeof TaskInputSchema>

export const TASK_INPUT_HINTS = [
    'Pass a JSON array of tasks. Each task needs "content", and can set description, due, deadline (YYYY-MM-DD), priority (p1-p4), labels (array), duration, assignee, section and subtasks (array of tasks).',
    'Example: [{"content": "Draft brief", "section": "Planning", "due": "friday", "subtasks": [{"content": "Collect quotes"}]}]',
]

/** The JSON Schema of the task list, generated from the same schema that validates it. */
export function taskListJsonSchema(): object {
    return z.toJSONSchema(TaskListSchema)
}

/**
 * Parses and validates the task list, reporting every problem with its
 * location (`[0].subtasks[1].priority`) before anything reaches the API.
 */
export function parseTaskList(raw: string): TaskInput[] {
    if (raw.trim() === '') {
        throw new CliError('INVALID_JSON', 'Input is empty; expected a JSON array of tasks.', [
            ...TASK_INPUT_HINTS,
        ])
    }
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        throw new CliError('INVALID_JSON', `Input is not valid JSON: ${reason}`, [
            ...TASK_INPUT_HINTS,
        ])
    }

    const result = TaskListSchema.safeParse(data)
    const problems = result.success
        ? findSubtaskSections(result.data)
        : result.error.issues.map(formatIssue)
    if (!result.success || problems.length > 0) {
        throw new CliError('INVALID_INPUT', `Invalid task list: ${listProblems(problems)}`, [
            ...TASK_INPUT_HINTS,
        ])
    }
    return result.data
}

/** A subtask always goes in its parent's section, so it cannot name its own. */
function findSubtaskSections(tasks: TaskInput[]): string[] {
    const problems: string[] = []
    const visit = (subtasks: TaskInput[] | undefined, path: string) => {
        subtasks?.forEach((subtask, index) => {
            const subtaskPath = `${path}.subtasks[${index}]`
            if (subtask.section !== undefined) {
                problems.push(`${subtaskPath}.section: a subtask goes in its parent's section`)
            }
            visit(subtask.subtasks, subtaskPath)
        })
    }
    tasks.forEach((task, index) => visit(task.subtasks, `[${index}]`))
    return problems
}

function formatIssue(issue: z.core.$ZodIssue): string {
    const where = issue.path
        .map((part, index) =>
            typeof part === 'number'
                ? `[${part}]`
                : index === 0
                  ? String(part)
                  : `.${String(part)}`,
        )
        .join('')
    const message =
        issue.code === 'unrecognized_keys'
            ? `unrecognised key${issue.keys.length === 1 ? '' : 's'} ${issue.keys.map((key) => `"${key}"`).join(', ')}`
            : issue.message
    return where ? `${where}: ${message}` : message
}

function listProblems(problems: string[]): string {
    const listed = problems.slice(0, MAX_LISTED_PROBLEMS).join('; ')
    const rest = problems.length - MAX_LISTED_PROBLEMS
    return rest > 0 ? `${listed}; and ${rest} more` : listed
}
