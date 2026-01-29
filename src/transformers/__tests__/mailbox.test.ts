/**
 * Tests for mailbox transformer - converts JMAP Mailbox objects to SimplifiedMailbox DTOs.
 * TDD RED phase: These tests define the expected behavior.
 */
import { describe, it, expect } from 'vitest';
import { transformMailbox } from '../mailbox.js';
import type { SimplifiedMailbox } from '../../types/dto.js';

describe('transformMailbox', () => {
  describe('core fields', () => {
    it('transforms basic mailbox properties', () => {
      const jmapMailbox = {
        id: 'm1',
        name: 'Inbox',
        role: 'inbox',
        totalEmails: 100,
        unreadEmails: 5,
        sortOrder: 1,
        parentId: null,
      };

      const result = transformMailbox(jmapMailbox);

      expect(result.id).toBe('m1');
      expect(result.name).toBe('Inbox');
      expect(result.role).toBe('inbox');
      expect(result.totalEmails).toBe(100);
      expect(result.unreadEmails).toBe(5);
      expect(result.sortOrder).toBe(1);
      expect(result.parentId).toBeNull();
    });

    it('preserves null role for custom folders', () => {
      const jmapMailbox = {
        id: 'm2',
        name: 'Custom Folder',
        role: null,
        totalEmails: 50,
        unreadEmails: 0,
        sortOrder: 100,
        parentId: null,
      };

      const result = transformMailbox(jmapMailbox);

      expect(result.role).toBeNull();
      expect(result.name).toBe('Custom Folder');
    });

    it('preserves parentId for nested folders', () => {
      const jmapMailbox = {
        id: 'm3',
        name: 'Subfolder',
        role: null,
        totalEmails: 10,
        unreadEmails: 2,
        sortOrder: 50,
        parentId: 'm1',
      };

      const result = transformMailbox(jmapMailbox);

      expect(result.parentId).toBe('m1');
    });
  });

  describe('standard roles', () => {
    // Non-null roles only for testing
    const standardRoles = [
      'inbox',
      'drafts',
      'sent',
      'trash',
      'junk',
      'archive',
      'all',
      'important',
      'subscribed',
    ] as const;

    it.each([...standardRoles])('preserves standard role: %s', (role) => {
      const jmapMailbox = {
        id: `m-${role}`,
        name: role.charAt(0).toUpperCase() + role.slice(1),
        role: role,
        totalEmails: 10,
        unreadEmails: 1,
        sortOrder: 1,
        parentId: null,
      };

      const result = transformMailbox(jmapMailbox);

      expect(result.role).toBe(role);
    });
  });

  describe('email counts', () => {
    it('handles zero counts', () => {
      const jmapMailbox = {
        id: 'm4',
        name: 'Empty Folder',
        role: null,
        totalEmails: 0,
        unreadEmails: 0,
        sortOrder: 10,
        parentId: null,
      };

      const result = transformMailbox(jmapMailbox);

      expect(result.totalEmails).toBe(0);
      expect(result.unreadEmails).toBe(0);
    });

    it('handles large counts', () => {
      const jmapMailbox = {
        id: 'm5',
        name: 'Archive',
        role: 'archive',
        totalEmails: 100000,
        unreadEmails: 50000,
        sortOrder: 10,
        parentId: null,
      };

      const result = transformMailbox(jmapMailbox);

      expect(result.totalEmails).toBe(100000);
      expect(result.unreadEmails).toBe(50000);
    });
  });

  describe('optional fields', () => {
    it('handles missing optional fields gracefully', () => {
      const jmapMailbox = {
        id: 'm6',
        name: 'Minimal Mailbox',
        role: null,
        totalEmails: 5,
        unreadEmails: 1,
        sortOrder: 1,
        parentId: null,
      };

      const result = transformMailbox(jmapMailbox);

      expect(result.id).toBe('m6');
      // Should not throw and should return valid object
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('role');
      expect(result).toHaveProperty('totalEmails');
      expect(result).toHaveProperty('unreadEmails');
    });

    it('includes totalThreads when present', () => {
      const jmapMailbox = {
        id: 'm7',
        name: 'With Threads',
        role: 'inbox',
        totalEmails: 100,
        unreadEmails: 10,
        totalThreads: 80,
        unreadThreads: 8,
        sortOrder: 1,
        parentId: null,
      };

      const result = transformMailbox(jmapMailbox);

      expect(result.totalThreads).toBe(80);
      expect(result.unreadThreads).toBe(8);
    });
  });

  describe('sorting', () => {
    it('preserves sortOrder values', () => {
      const mailboxes = [
        { id: 'm1', name: 'Inbox', role: 'inbox', totalEmails: 100, unreadEmails: 5, sortOrder: 1, parentId: null },
        { id: 'm2', name: 'Sent', role: 'sent', totalEmails: 50, unreadEmails: 0, sortOrder: 2, parentId: null },
        { id: 'm3', name: 'Custom', role: null, totalEmails: 10, unreadEmails: 1, sortOrder: 100, parentId: null },
      ];

      const results = mailboxes.map(transformMailbox);

      expect(results[0].sortOrder).toBe(1);
      expect(results[1].sortOrder).toBe(2);
      expect(results[2].sortOrder).toBe(100);
    });
  });

  describe('myRights', () => {
    it('includes myRights when present', () => {
      const jmapMailbox = {
        id: 'm8',
        name: 'Shared Folder',
        role: null,
        totalEmails: 10,
        unreadEmails: 2,
        sortOrder: 50,
        parentId: null,
        myRights: {
          mayReadItems: true,
          mayAddItems: true,
          mayRemoveItems: false,
          maySetSeen: true,
          maySetKeywords: true,
          mayCreateChild: false,
          mayRename: false,
          mayDelete: false,
          maySubmit: true,
        },
      };

      const result = transformMailbox(jmapMailbox);

      expect(result.myRights).toBeDefined();
      expect(result.myRights!.mayReadItems).toBe(true);
      expect(result.myRights!.mayRemoveItems).toBe(false);
    });
  });

  describe('isSubscribed', () => {
    it('includes isSubscribed when present', () => {
      const jmapMailbox = {
        id: 'm9',
        name: 'Subscribed Folder',
        role: null,
        totalEmails: 10,
        unreadEmails: 0,
        sortOrder: 50,
        parentId: null,
        isSubscribed: true,
      };

      const result = transformMailbox(jmapMailbox);

      expect(result.isSubscribed).toBe(true);
    });

    it('handles isSubscribed: false', () => {
      const jmapMailbox = {
        id: 'm10',
        name: 'Unsubscribed Folder',
        role: null,
        totalEmails: 10,
        unreadEmails: 0,
        sortOrder: 50,
        parentId: null,
        isSubscribed: false,
      };

      const result = transformMailbox(jmapMailbox);

      expect(result.isSubscribed).toBe(false);
    });
  });
});
