import React from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../../design/components/Screen';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { spacing } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { useSession } from '../../../services/session/sessionContext';
import { CommunityMe, fetchCommunityMe, updateCommunityMute } from '../communityPreferencesService';

const QUERY_KEY = ['communityMe'];

/** Mute only affects push notifications for new messages — it never changes
 *  membership or hides messages in the app itself. Optimistic toggle,
 *  reverted only if the server rejects it. */
export function CommunitySettingsScreen() {
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: () => fetchCommunityMe(apiClient) });

  const mutation = useMutation({
    mutationFn: (muted: boolean) => updateCommunityMute(apiClient, muted),
    onMutate: async (nextMuted) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<CommunityMe>(QUERY_KEY);
      if (previous) queryClient.setQueryData<CommunityMe>(QUERY_KEY, { ...previous, muted: nextMuted });
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
    },
  });

  const muted = query.data?.muted ?? false;

  return (
    <Screen>
      <BrandHeading variant="title" style={styles.title}>
        frinq squad notifications
      </BrandHeading>
      <BodyText variant="caption" tone="secondary" style={styles.hint}>
        this only affects push notifications for new messages — it never changes your membership
        or hides messages in the app itself.
      </BodyText>

      {query.isError && (
        <BodyText variant="caption" tone="error" accessibilityRole="alert" style={styles.hint}>
          couldn't load your preferences
        </BodyText>
      )}
      {mutation.isError && (
        <BodyText variant="caption" tone="error" accessibilityRole="alert" style={styles.hint}>
          couldn't save, try again
        </BodyText>
      )}

      {query.isPending || query.isError ? (
        <BodyText variant="body" tone="secondary">
          {query.isPending ? 'loading…' : 'try again later'}
        </BodyText>
      ) : (
        <View style={styles.row}>
          <BodyText variant="body" style={styles.label}>
            notify me about new messages
          </BodyText>
          <Switch
            value={!muted}
            onValueChange={(next) => mutation.mutate(!next)}
            disabled={mutation.isPending}
            trackColor={{ false: color.border.subtle, true: color.state.selected }}
            thumbColor={color.brand.cream}
            accessibilityLabel="notify me about new messages"
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  hint: { marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  label: { flex: 1, marginRight: spacing.md },
});
