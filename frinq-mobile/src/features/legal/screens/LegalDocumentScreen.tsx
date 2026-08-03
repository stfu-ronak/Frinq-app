import React from 'react';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Screen } from '../../../design/components/Screen';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { spacing } from '../../../design/tokens/spacing';
import { View } from 'react-native';

export type LegalDocKey = 'terms' | 'privacy' | 'community-rules';

export type LegalDocumentRouteParams = { LegalDocument: { doc: LegalDocKey } };

const COPY: Record<LegalDocKey, { title: string; version: string; body: string[] }> = {
  terms: {
    title: 'Terms of Service',
    version: 'draft-1',
    body: [
      'This is placeholder text. Frinq’s real Terms of Service will be written and reviewed by counsel before this app is available to the public.',
      'Nothing on this screen should be relied on as a legal document.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    version: 'draft-1',
    body: [
      'This is placeholder text. Frinq’s real Privacy Policy — including what data is collected, how long it’s retained, who processes it, and how to delete your account — will be written and reviewed by counsel before this app is available to the public.',
      'You can delete your account and its data at any time from Settings.',
    ],
  },
  'community-rules': {
    title: 'Frinq Squad Rules',
    version: 'draft-1',
    body: [
      'Be kind — this is a small, text-only space for real conversation.',
      'No spam, harassment, hate speech, or sexual content.',
      'No impersonation of other members, moderators, or the Frinq team.',
      'Report anything that concerns you — reports are reviewed by a real person.',
    ],
  },
};

/** Static legal document viewer. Draft placeholder copy only — engineering
 *  does not invent real legal text; see COPY above and the web equivalent. */
export function LegalDocumentScreen() {
  const route = useRoute<RouteProp<LegalDocumentRouteParams, 'LegalDocument'>>();
  const doc = COPY[route.params.doc];

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xl }}>
        <BodyText variant="overline" tone="error">
          DRAFT — NOT REVIEWED BY COUNSEL
        </BodyText>
        <BrandHeading variant="title" style={{ marginTop: spacing.sm, marginBottom: spacing.lg }}>
          {doc.title}
        </BrandHeading>
        {doc.body.map((p, i) => (
          <BodyText key={i} variant="body" tone="secondary" style={{ marginBottom: spacing.md }}>
            {p}
          </BodyText>
        ))}
        <BodyText variant="caption" tone="secondary" style={{ marginTop: spacing.lg }}>
          version: {doc.version}
        </BodyText>
      </View>
    </Screen>
  );
}
