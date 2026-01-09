import { Command } from 'commander'
import { getApi, type Project } from '../lib/api.js'
import { formatTaskRow } from '../lib/output.js'
import chalk from 'chalk'

export function registerTodayCommand(program: Command): void {
  program
    .command('today')
    .description('Show tasks due today and overdue')
    .action(async () => {
      const api = await getApi()
      const { results: tasks } = await api.getTasks()
      const { results: allProjects } = await api.getProjects()
      const projects = new Map<string, Project>(allProjects.map((p) => [p.id, p]))

      const today = new Date().toISOString().split('T')[0]

      const overdue = tasks.filter((t) => t.due && t.due.date < today)
      const dueToday = tasks.filter((t) => t.due?.date === today)

      if (overdue.length === 0 && dueToday.length === 0) {
        console.log('No tasks due today.')
        return
      }

      if (overdue.length === 0) {
        for (const task of dueToday) {
          console.log(formatTaskRow(task, projects.get(task.projectId)?.name))
        }
        return
      }

      console.log(chalk.red.bold('Overdue'))
      for (const task of overdue) {
        console.log(formatTaskRow(task, projects.get(task.projectId)?.name))
      }

      if (dueToday.length > 0) {
        console.log('')
        console.log(chalk.bold('Today'))
        for (const task of dueToday) {
          console.log(formatTaskRow(task, projects.get(task.projectId)?.name))
        }
      }
    })
}
