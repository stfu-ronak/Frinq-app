import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { CommunityMessage } from '../features/community/components/CommunityMessage';
import { CommunityHeader } from '../features/community/components/CommunityHeader';
import { MessageComposer } from '../features/community/components/MessageComposer';
import { NavRow } from '../design/components/NavRow';
import { PrimaryButton } from '../design/components/PrimaryButton';
import { touchTarget } from '../design/tokens/spacing';
import { DisplayMessage } from '../features/community/communityMessageStore';

/**
 * Task 40 Step 2 — automated accessibility gates for the app's riskiest,
 * newest surface (community chat, Tasks 37-38) plus shared primitives used
 * everywhere. Complements (not a replacement for) the real on-device
 * TalkBack/200%-font/reduced-motion pass already run for chat during Task
 * 38's gap-closing, and the Step 3 device-matrix pass this task also runs.
 */

const MESSAGE: DisplayMessage = {
  id: 1,
  clientMessageId: 'cmid-1',
  body: 'hello there',
  authorId: 'other-user',
  authorDisplayName: 'Priya',
  createdAt: '2026-01-01T00:00:00Z',
  status: 'sent',
};

function flatten(style: unknown) {
  return StyleSheet.flatten(style as never) as Record<string, number | undefined>;
}

describe('no per-message announcement — single connection-state live region only', () => {
  it('CommunityMessage never sets accessibilityLiveRegion, on any message state', () => {
    for (const status of ['sent', 'sending', 'failed'] as const) {
      const { toJSON } = render(
        <CommunityMessage
          message={{ ...MESSAGE, status }}
          isOwn={false}
          onRetry={() => {}}
          onOpenActions={() => {}}
        />,
      );
      const tree = JSON.stringify(toJSON());
      expect(tree).not.toContain('accessibilityLiveRegion');
    }
  });

  it('CommunityHeader exposes exactly one live region, only while disconnected', () => {
    const connected = render(<CommunityHeader communitySlug="quiet-storm" connectionState="connected" />);
    expect(JSON.stringify(connected.toJSON())).not.toContain('accessibilityLiveRegion');

    const disconnected = render(<CommunityHeader communitySlug="quiet-storm" connectionState="retrying" />);
    const matches = JSON.stringify(disconnected.toJSON()).match(/accessibilityLiveRegion/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});

describe('composer accessibility state tracks real send-ability, not just visual style', () => {
  it('send button reports disabled via accessibilityState while the composer is disabled', () => {
    const { getByLabelText } = render(<MessageComposer onSend={() => {}} disabled />);
    expect(getByLabelText('send message').props.accessibilityState).toEqual({ disabled: true });
  });

  it('send button reports disabled while enabled but empty, enabled once text exists', () => {
    const { getByLabelText } = render(<MessageComposer onSend={() => {}} disabled={false} />);
    expect(getByLabelText('send message').props.accessibilityState).toEqual({ disabled: true });
  });
});

describe('48dp minimum touch targets on real interactive chat controls', () => {
  it('the composer input and send button both meet the preferred 48dp target', () => {
    const { getByLabelText } = render(<MessageComposer onSend={() => {}} disabled={false} />);
    const input = flatten(getByLabelText('message').props.style);
    const send = flatten(getByLabelText('send message').props.style);
    expect(input.minHeight).toBeGreaterThanOrEqual(touchTarget.preferred);
    expect(send.minWidth).toBeGreaterThanOrEqual(touchTarget.preferred);
    expect(send.minHeight).toBeGreaterThanOrEqual(touchTarget.preferred);
  });

  it("the per-message actions button meets at least the 44dp floor", () => {
    const { getByLabelText } = render(
      <CommunityMessage message={MESSAGE} isOwn={false} onRetry={() => {}} onOpenActions={() => {}} />,
    );
    const actions = flatten(getByLabelText('message actions').props.style);
    expect(actions.minWidth).toBeGreaterThanOrEqual(touchTarget.min);
    expect(actions.minHeight).toBeGreaterThanOrEqual(touchTarget.min);
  });
});

describe('roles, names, and state on shared interactive primitives', () => {
  it('NavRow exposes a button role, its label as the accessible name, and disabled state', () => {
    const { getByLabelText } = render(<NavRow label="notifications" onPress={() => {}} disabled />);
    const row = getByLabelText('notifications');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it('PrimaryButton exposes busy state distinctly from disabled', () => {
    const { getByLabelText } = render(<PrimaryButton label="save" onPress={() => {}} busy />);
    const button = getByLabelText('save');
    expect(button.props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
  });
});

describe('no color-only meaning — failed/error states always pair color with text', () => {
  it("a failed message shows literal retry text, not just a color change", () => {
    const { getByText } = render(
      <CommunityMessage message={{ ...MESSAGE, status: 'failed' }} isOwn={false} onRetry={() => {}} onOpenActions={() => {}} />,
    );
    expect(getByText("couldn't send · retry")).toBeTruthy();
  });
});
