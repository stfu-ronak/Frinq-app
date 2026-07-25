import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../../design/components/Screen';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { TextField } from '../../../design/components/TextField';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { Dialog } from '../../../design/components/Dialog';
import { spacing } from '../../../design/tokens/spacing';
import { useSession } from '../../../services/session/sessionContext';
import { ApiError } from '../../../services/api/apiError';
import { fetchProfile, updateDisplayName, mapDisplayNameError, DISPLAY_NAME_MAX } from '../profileService';

/** Only display_name is editable — quiz-derived fields (archetype, etc.)
 *  never appear here. Optimistic UI only after server acceptance: navigation
 *  back happens only once the PATCH actually succeeds. */
export function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['userMe'], queryFn: () => fetchProfile(apiClient) });

  const [original, setOriginal] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (query.data && original === null) {
      setOriginal(query.data.display_name ?? '');
      setValue(query.data.display_name ?? '');
    }
  }, [query.data, original]);

  const dirty = original !== null && value.trim() !== original;

  const mutation = useMutation({
    mutationFn: (name: string) => updateDisplayName(apiClient, name),
    onSuccess: (updated) => {
      queryClient.setQueryData(['userMe'], updated);
      navigation.goBack();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? mapDisplayNameError(err.code) : 'network error, try again');
    },
  });

  function handleCancel() {
    if (dirty) setConfirmDiscard(true);
    else navigation.goBack();
  }

  function handleSave() {
    if (mutation.isPending || !dirty) return;
    setError(null);
    mutation.mutate(value.trim());
  }

  if (query.isPending || original === null) return null;

  return (
    <Screen scroll>
      <BrandHeading variant="title" style={styles.title}>
        edit profile
      </BrandHeading>

      <TextField
        label="display name"
        value={value}
        onChangeText={setValue}
        error={error}
        maxLength={DISPLAY_NAME_MAX + 20}
      />
      <BodyText variant="caption" tone="secondary" style={styles.count}>
        {value.trim().length}/{DISPLAY_NAME_MAX}
      </BodyText>

      <View style={styles.actions}>
        <PrimaryButton label="cancel" variant="secondary" onPress={handleCancel} style={styles.action} />
        <PrimaryButton
          label={mutation.isPending ? 'saving…' : 'save'}
          onPress={handleSave}
          disabled={!dirty}
          busy={mutation.isPending}
          style={styles.action}
        />
      </View>

      <Dialog
        visible={confirmDiscard}
        title="discard your changes?"
        confirm={{ label: 'discard', onPress: () => { setConfirmDiscard(false); navigation.goBack(); } }}
        cancel={{ label: 'keep editing', onPress: () => setConfirmDiscard(false) }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.xl },
  count: { textAlign: 'right', marginTop: spacing.xs, marginBottom: spacing.lg },
  actions: { flexDirection: 'row', marginTop: spacing.lg },
  action: { marginRight: spacing.md },
});
