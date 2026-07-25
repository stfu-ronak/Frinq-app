import React from 'react';
import { StyleSheet, View } from 'react-native';
import { color } from '../../../design/tokens/colors';
import { spacing } from '../../../design/tokens/spacing';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { ConnectionState } from '../../../services/realtime/realtimeMachine';

const STATE_COPY: Record<ConnectionState, string> = {
  disconnected: 'not connected',
  connecting: 'connecting…',
  connected: 'connected',
  retrying: 'reconnecting…',
  offline: "you're offline",
  authExpired: 'session expired — sign in again',
  suspended: 'your account is suspended',
  banned: 'your account has been banned',
};

function humanize(slug: string): string {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

type Props = {
  communitySlug: string;
  connectionState: ConnectionState;
};

/** A single aria-live region for connection-state changes only — never
 *  per-message, per the accessibility requirement that incoming messages
 *  must not be announced individually. */
export function CommunityHeader({ communitySlug, connectionState }: Props) {
  const showBanner = connectionState !== 'connected';
  return (
    <View style={styles.wrap}>
      <BodyText variant="overline" tone="secondary">
        your community
      </BodyText>
      <BrandHeading variant="heading" style={styles.title}>
        {humanize(communitySlug)}
      </BrandHeading>
      {showBanner && (
        <BodyText variant="caption" tone="error" accessibilityLiveRegion="polite" style={styles.banner}>
          {STATE_COPY[connectionState]}
        </BodyText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: color.border.subtle },
  title: { marginTop: spacing.xxs },
  banner: { marginTop: spacing.xs },
});
