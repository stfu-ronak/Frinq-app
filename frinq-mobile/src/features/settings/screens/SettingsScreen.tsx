import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../../design/components/Screen';
import { BrandHeading } from '../../../design/components/Text';
import { NavRow } from '../../../design/components/NavRow';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { spacing } from '../../../design/tokens/spacing';
import { useSession } from '../../../services/session/sessionContext';
import { performLogout } from '../logoutService';

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { apiClient, coordinator } = useSession();
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await performLogout(apiClient, coordinator, queryClient);
      // No explicit navigation: coordinator.clear() flips `authenticated`,
      // which App.tsx's boot resolver already reacts to, routing to the
      // signed-out root — same mechanism every other auth-state change uses.
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <Screen scroll>
      <BrandHeading variant="title" style={styles.title}>
        settings
      </BrandHeading>

      <View style={styles.list}>
        <NavRow label="edit profile" onPress={() => navigation.navigate('EditProfile')} />
        <NavRow label="frinq squad notifications" onPress={() => navigation.navigate('CommunitySettings')} />
        <NavRow label="notifications" onPress={() => navigation.navigate('Notifications')} />
        <NavRow label="privacy & analytics" onPress={() => navigation.navigate('PrivacySettings')} />
        <NavRow label="legal" onPress={() => navigation.navigate('Legal')} />
        <NavRow label="support" onPress={() => navigation.navigate('Support')} />
        <NavRow label="delete account" destructive onPress={() => navigation.navigate('Account')} />
      </View>

      <PrimaryButton
        label={loggingOut ? 'logging out…' : 'log out'}
        variant="secondary"
        busy={loggingOut}
        onPress={handleLogout}
        style={styles.logout}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.xl },
  list: { marginBottom: spacing.xxl },
  logout: { alignSelf: 'flex-start' },
});
