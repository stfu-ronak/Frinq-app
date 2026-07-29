import React, { useCallback, useEffect, useState } from 'react';
import { Image, Linking, StyleSheet, View } from 'react-native';
import { Screen } from '../../../design/components/Screen';
import { EmptyState } from '../../../design/components/EmptyState';
import { ErrorState } from '../../../design/components/ErrorState';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { color } from '../../../design/tokens/colors';
import { spacing, radius } from '../../../design/tokens/spacing';
import { BootSplash } from '../../../navigation/placeholders';
import { useSession } from '../../../services/session/sessionContext';
import { track } from '../../../services/telemetry/analytics';
import { FrinqEvent } from '../eventService';
import { fetchEvents } from '../eventService';

type ViewState = 'loading' | 'ready' | 'empty' | 'error';

function isSafeRegistrationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function EventCardView({ event }: { event: FrinqEvent }) {
  const openRegistration = useCallback(async () => {
    if (!isSafeRegistrationUrl(event.registration_url)) return;
    track('event_registration_opened');
    await Linking.openURL(event.registration_url);
  }, [event.registration_url]);

  return (
    <View style={styles.card} testID={`event-${event.id}`}>
      <View style={styles.imagePlaceholder}>
        <Image source={{ uri: event.image_url }} style={styles.image} accessibilityLabel={`${event.name} image`} />
      </View>
      <View style={styles.cardBody}>
        <BodyText variant="caption" tone="secondary" style={styles.date}>
          {new Date(event.starts_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </BodyText>
        <BrandHeading variant="heading">{event.name}</BrandHeading>
        <BodyText variant="bodyStrong" style={styles.quote}>{event.quote}</BodyText>
        <BodyText variant="body" tone="secondary" style={styles.details}>{event.details}</BodyText>
        <PrimaryButton label="register" onPress={() => void openRegistration()} style={styles.button} />
      </View>
    </View>
  );
}

export function EventsScreen() {
  const { apiClient } = useSession();
  const [state, setState] = useState<ViewState>('loading');
  const [events, setEvents] = useState<FrinqEvent[]>([]);
  const [stale, setStale] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const response = await fetchEvents(apiClient);
      setEvents(response.events);
      setStale(response.stale === true);
      setState(response.events.length ? 'ready' : 'empty');
      if (response.events.length) track('event_viewed');
    } catch {
      setState('error');
    }
  }, [apiClient]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === 'loading') return <BootSplash />;
  if (state === 'error') return <Screen><ErrorState message="couldn't load events." onRetry={load} /></Screen>;
  if (state === 'empty') return <Screen><EmptyState title="no events yet" message="check back soon for the next Frinq gathering." /></Screen>;

  return (
    <Screen scroll>
      <BrandHeading variant="title">events</BrandHeading>
      <BodyText variant="body" tone="secondary" style={styles.intro}>things worth showing up for.</BodyText>
      {stale && <BodyText variant="caption" tone="secondary">showing the last saved event list.</BodyText>}
      <View style={styles.timeline}>
        {events.map((event) => <EventCardView key={event.id} event={event} />)}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginTop: spacing.xs, marginBottom: spacing.xl },
  timeline: { gap: spacing.lg },
  card: { backgroundColor: color.bg.surface, borderRadius: radius.lg, overflow: 'hidden' },
  imagePlaceholder: { height: 140, backgroundColor: color.brand.peach, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  cardBody: { padding: spacing.lg },
  date: { textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs },
  quote: { marginTop: spacing.sm },
  details: { marginTop: spacing.sm, lineHeight: 22 },
  button: { marginTop: spacing.lg },
});
