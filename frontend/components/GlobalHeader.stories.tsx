/**
 * @file GlobalHeader.stories.tsx
 * @description Storybook stories for the ATLAS GlobalHeader component.
 *
 * ARCHITECTURE: GlobalHeader is store-driven (Zustand) with no external props.
 * We control rendered state by directly calling useAuthStore.setState() in each
 * story's `beforeEach` decorator — the cleanest pattern for Zustand + Storybook
 * without requiring a Provider wrapper or mock injection framework.
 *
 * US-02: Storybook accessible online with meaningful component stories.
 */

import type { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import GlobalHeader from './GlobalHeader';
import { useAuthStore } from '@/lib/store/useAuthStore';

// =============================================================================
// STORYBOOK META
// =============================================================================

const meta: Meta<typeof GlobalHeader> = {
  title: 'Navigation/GlobalHeader',
  component: GlobalHeader,
  tags: ['autodocs'],
  parameters: {
    // Render at full viewport width — this is a full-bleed header component.
    layout: 'fullscreen',
    // DEFENSIVE STORYBOOK: Disable Next.js router warnings in the actions panel.
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: '/search',
      },
    },
    docs: {
      description: {
        component: `
The primary navigation bar for the ATLAS platform.

**Behavior:**
- **Unauthenticated:** Shows logo + Log in / Sign up CTAs only.
- **Authenticated (Student):** Shows Search, Upload nav links + user context + logout.
- **Authenticated (Teacher/Admin):** Adds the Admin Panel link with red accent styling.
- **Mobile (< 768px):** Collapses to a hamburger menu with full-height slide-down drawer.

**State:** Fully driven by the Zustand \`useAuthStore\`. No external props.
        `,
      },
    },
  },
  // ARCHITECTURE: Reset Zustand auth store to unauthenticated state before every story
  // to guarantee story isolation. Without this, stories bleed state into each other
  // when navigated via the Storybook sidebar.
  decorators: [
    (Story) => {
      useEffect(() => {
        return () => {
          useAuthStore.setState({ isAuthenticated: false, user: null });
        };
      }, []);
      return <Story />;
    },
  ],
};

export default meta;
type Story = StoryObj<typeof GlobalHeader>;

// =============================================================================
// STORY: Unauthenticated
// =============================================================================

/**
 * The default public-facing header shown to logged-out visitors.
 * Logo links to '/', nav links are hidden, CTA buttons are shown.
 */
export const Unauthenticated: Story = {
  decorators: [
    (Story) => {
      useEffect(() => {
        useAuthStore.setState({ isAuthenticated: false, user: null });
      }, []);
      return <Story />;
    },
  ],
  parameters: {
    docs: {
      description: {
        story: 'Public-facing header. No navigation links. Shows Log in and Sign up CTAs.',
      },
    },
  },
};

// =============================================================================
// STORY: Authenticated — Student
// =============================================================================

/**
 * Header state for a logged-in student.
 * Shows Search + Upload links. No Admin Panel link.
 * Logo links to '/search'.
 */
export const AuthenticatedStudent: Story = {
  decorators: [
    (Story) => {
      useEffect(() => {
        useAuthStore.setState({
          isAuthenticated: true,
          user: {
            id: 'usr_student_001',
            email: 'ahmed.student@enit.utm.tn',
            role: 'STUDENT',
          },
        });
      }, []);
      return <Story />;
    },
  ],
  parameters: {
    nextjs: {
      navigation: { pathname: '/search' },
    },
    docs: {
      description: {
        story:
          'Authenticated student. Search and Upload links visible. Admin Panel is hidden. Active route `/search` is highlighted.',
      },
    },
  },
};

// =============================================================================
// STORY: Authenticated — Teacher
// =============================================================================

/**
 * Header state for a verified teacher.
 * Shows the Admin Panel link with red accent — moderator access boundary.
 */
export const AuthenticatedTeacher: Story = {
  decorators: [
    (Story) => {
      useEffect(() => {
        useAuthStore.setState({
          isAuthenticated: true,
          user: {
            id: 'usr_teacher_042',
            email: 'dr.mansour@enit.utm.tn',
            role: 'TEACHER',
          },
        });
      }, []);
      return <Story />;
    },
  ],
  parameters: {
    nextjs: {
      navigation: { pathname: '/admin/moderation' },
    },
    docs: {
      description: {
        story:
          'Authenticated teacher/moderator. Admin Panel link appears in red. Active route `/admin/moderation` triggers the red active-state highlight.',
      },
    },
  },
};

// =============================================================================
// STORY: Authenticated — Admin
// =============================================================================

/**
 * Header state for a platform administrator (god-mode).
 * Functionally identical to Teacher in the header — both see the Admin Panel link.
 * Shown separately to validate the RBAC derived state for `role === 'ADMIN'`.
 */
export const AuthenticatedAdmin: Story = {
  decorators: [
    (Story) => {
      useEffect(() => {
        useAuthStore.setState({
          isAuthenticated: true,
          user: {
            id: 'usr_admin_001',
            email: 'admin@atlas.tn',
            role: 'ADMIN',
          },
        });
      }, []);
      return <Story />;
    },
  ],
  parameters: {
    nextjs: {
      navigation: { pathname: '/admin/moderation' },
    },
    docs: {
      description: {
        story:
          'Platform administrator. Same visual as Teacher but validates the `role === ADMIN` RBAC branch independently.',
      },
    },
  },
};

// =============================================================================
// STORY: Mobile Viewport — Menu Open
// =============================================================================

/**
 * Validates the mobile hamburger menu in its open/expanded state.
 * Simulates a 390px wide viewport (iPhone 14 Pro). Storybook cannot
 * auto-trigger the React state toggle, so this story opens at the
 * mobile breakpoint — the user can click the hamburger to see the drawer.
 */
export const MobileMenuClosed: Story = {
  decorators: [
    (Story) => {
      useEffect(() => {
        useAuthStore.setState({
          isAuthenticated: true,
          user: {
            id: 'usr_student_002',
            email: 'sara.mobile@enit.utm.tn',
            role: 'STUDENT',
          },
        });
      }, []);
      return <Story />;
    },
  ],
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
    nextjs: {
      navigation: { pathname: '/search' },
    },
    docs: {
      description: {
        story:
          'Mobile viewport (390px). Desktop nav is hidden. Hamburger icon is visible. Click it to expand the mobile drawer.',
      },
    },
  },
};