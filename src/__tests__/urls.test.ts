import { describe, expect, it } from 'vitest'
import {
    commentUrl,
    filterUrl,
    labelUrl,
    projectCommentUrl,
    projectUrl,
    sectionUrl,
    taskUrl,
} from '../lib/urls.js'

describe('URL builders', () => {
    describe('taskUrl', () => {
        it('generates correct web app URL', () => {
            expect(taskUrl('123')).toBe('https://app.todoist.com/app/task/123')
        })

        it('handles alphanumeric IDs', () => {
            expect(taskUrl('abc123xyz')).toBe('https://app.todoist.com/app/task/abc123xyz')
        })
    })

    describe('projectUrl', () => {
        it('generates correct web app URL', () => {
            expect(projectUrl('456')).toBe('https://app.todoist.com/app/project/456')
        })
    })

    describe('labelUrl', () => {
        it('generates correct web app URL', () => {
            expect(labelUrl('789')).toBe('https://app.todoist.com/app/label/789')
        })
    })

    describe('filterUrl', () => {
        it('generates correct web app URL', () => {
            expect(filterUrl('filter-1')).toBe('https://app.todoist.com/app/filter/filter-1')
        })
    })

    describe('sectionUrl', () => {
        it('generates correct web app URL', () => {
            expect(sectionUrl('section-abc')).toBe(
                'https://app.todoist.com/app/section/section-abc',
            )
        })
    })

    describe('commentUrl', () => {
        it('generates correct web app URL with fragment', () => {
            expect(commentUrl('task-1', 'comment-2')).toBe(
                'https://app.todoist.com/app/task/task-1#comment-comment-2',
            )
        })
    })

    describe('projectCommentUrl', () => {
        it('generates correct web app URL for project comment', () => {
            expect(projectCommentUrl('project-1', 'comment-2')).toBe(
                'https://app.todoist.com/app/project/project-1/comments#comment-comment-2',
            )
        })
    })
})
