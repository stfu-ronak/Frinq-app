import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../../design/components/Screen';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { TextField } from '../../../design/components/TextField';
import { ChoicePill } from '../../../design/components/ChoicePill';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { Dialog } from '../../../design/components/Dialog';
import { spacing } from '../../../design/tokens/spacing';
import { useSession } from '../../../services/session/sessionContext';
import { ApiError } from '../../../services/api/apiError';
import { ProfilePatch, fetchProfile, updateProfile, mapDisplayNameError, DISPLAY_NAME_MAX } from '../profileService';
import { UserResponse } from '../../../services/api/contracts';
import { GENDER_OPTIONS } from '../../../services/api/genderOptions';
import { NCR_ZONE_OPTIONS } from '../../../services/api/ncrZoneOptions';

const NAME_CHANGE_COOLDOWN_DAYS = 90;

function nextNameChangeDate(updatedAt: string | null | undefined): Date | null {
  if (!updatedAt) return null;
  const next = new Date(updatedAt);
  next.setDate(next.getDate() + NAME_CHANGE_COOLDOWN_DAYS);
  return next;
}

/** display_name, gender, age, and area (ncr_zone) are all editable here —
 *  community/phone stay read-only (server also refuses to patch phone; the
 *  community-membership backend has no reassign path at all). display_name
 *  is additionally rate-limited to once every 3 months — every OTHER field
 *  is unaffected by that cooldown. */
export function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const { apiClient } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['userMe'], queryFn: () => fetchProfile(apiClient) });

  const [original, setOriginal] = useState<{ name: string; gender: string; age: string; ncrZone: string } | null>(null);
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [ncrZone, setNcrZone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (query.data && original === null) {
      const seeded = {
        name: query.data.display_name ?? '',
        gender: query.data.gender ?? '',
        age: query.data.age != null ? String(query.data.age) : '',
        ncrZone: query.data.ncr_zone ?? '',
      };
      setOriginal(seeded);
      setName(seeded.name);
      setGender(seeded.gender);
      setAge(seeded.age);
      setNcrZone(seeded.ncrZone);
    }
  }, [query.data, original]);

  const nameDirty = original !== null && name.trim() !== original.name;
  const genderDirty = original !== null && gender !== original.gender;
  const ageDirty = original !== null && age !== original.age;
  const ncrZoneDirty = original !== null && ncrZone !== original.ncrZone;
  const dirty = nameDirty || genderDirty || ageDirty || ncrZoneDirty;

  const nameCooldownUntil = nextNameChangeDate(query.data?.display_name_updated_at);
  const nameLocked = !!nameCooldownUntil && nameCooldownUntil > new Date();

  const mutation = useMutation({
    mutationFn: (patch: ProfilePatch) => updateProfile(apiClient, patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ['userMe'] });
      const previous = queryClient.getQueryData<UserResponse>(['userMe']);
      if (previous) queryClient.setQueryData<UserResponse>(['userMe'], { ...previous, ...patch });
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['userMe'], updated);
      navigation.goBack();
    },
    onError: (err, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(['userMe'], context.previous);
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
    // Only include a field in the PATCH when it actually changed — sending
    // display_name unconditionally would trip the server's 3-month rate
    // limit on every save, even ones that only touched age/gender/area.
    const patch: ProfilePatch = {};
    if (nameDirty) patch.display_name = name.trim();
    if (genderDirty) patch.gender = gender;
    if (ageDirty && age.trim()) patch.age = Number(age);
    if (ncrZoneDirty) patch.ncr_zone = ncrZone;
    mutation.mutate(patch);
  }

  if (query.isPending || original === null) return null;

  return (
    <Screen scroll>
      <BrandHeading variant="title" style={styles.title}>
        edit profile
      </BrandHeading>

      <TextField
        label="display name"
        value={name}
        onChangeText={setName}
        error={error}
        editable={!nameLocked}
        maxLength={DISPLAY_NAME_MAX + 20}
      />
      <BodyText variant="caption" tone="secondary" style={styles.count}>
        {name.trim().length}/{DISPLAY_NAME_MAX}
      </BodyText>
      {nameLocked && (
        <BodyText variant="caption" tone="secondary" style={styles.cooldown}>
          you can change your name again on {nameCooldownUntil!.toLocaleDateString()}
        </BodyText>
      )}

      <BodyText variant="overline" tone="secondary" style={styles.sectionLabel}>gender</BodyText>
      <View style={styles.pillRow} accessibilityRole="radiogroup">
        {GENDER_OPTIONS.map((opt) => (
          <ChoicePill key={opt.value} label={opt.label} selected={gender === opt.value} onPress={() => setGender(opt.value)} style={styles.pill} />
        ))}
      </View>

      <TextField
        label="age"
        value={age}
        onChangeText={(v) => setAge(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        maxLength={2}
        containerStyle={styles.sectionLabel}
      />

      <BodyText variant="overline" tone="secondary" style={styles.sectionLabel}>area</BodyText>
      <View style={styles.pillRow} accessibilityRole="radiogroup">
        {NCR_ZONE_OPTIONS.map((opt) => (
          <ChoicePill key={opt.value} label={opt.label} selected={ncrZone === opt.value} onPress={() => setNcrZone(opt.value)} style={styles.pill} />
        ))}
      </View>

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
  count: { textAlign: 'right', marginTop: spacing.xs },
  cooldown: { marginTop: spacing.xs, marginBottom: spacing.lg },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: { marginRight: spacing.sm, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', marginTop: spacing.xl },
  action: { marginRight: spacing.md },
});
