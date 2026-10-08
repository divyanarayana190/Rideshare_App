import { LegalDocumentScreen } from "@/components/legal/LegalDocumentScreen";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  CURRENT_LEGAL_VERSION,
  SIGNUP_LEGAL_DOCUMENTS,
  type SignupLegalDocKey,
} from "@/shared/legal";
import { Platform, Pressable, Text, View } from "react-native";
import { useState } from "react";

export interface LegalAcceptanceState {
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
  communityAcceptedAt: string | null;
  termsReviewed: boolean;
  privacyReviewed: boolean;
  communityReviewed: boolean;
}

export function createEmptyLegalAcceptanceState(): LegalAcceptanceState {
  return {
    termsAcceptedAt: null,
    privacyAcceptedAt: null,
    communityAcceptedAt: null,
    termsReviewed: false,
    privacyReviewed: false,
    communityReviewed: false,
  };
}

export function isLegalFullyAccepted(state: LegalAcceptanceState): boolean {
  return !!(state.termsAcceptedAt && state.privacyAcceptedAt && state.communityAcceptedAt);
}

type DocStatus = "not_reviewed" | "reviewed" | "accepted";

function getDocStatus(key: SignupLegalDocKey, state: LegalAcceptanceState): DocStatus {
  const acceptedKey = `${key}AcceptedAt` as keyof LegalAcceptanceState;
  const reviewedKey = `${key}Reviewed` as keyof LegalAcceptanceState;
  if (state[acceptedKey]) return "accepted";
  if (state[reviewedKey]) return "reviewed";
  return "not_reviewed";
}

function statusLabel(status: DocStatus): string {
  if (status === "accepted") return "Accepted";
  if (status === "reviewed") return "Reviewed";
  return "Not reviewed";
}

function statusColors(status: DocStatus, colors: ReturnType<typeof useColors>) {
  if (status === "accepted") return { bg: `${colors.primary}22`, text: colors.primary };
  if (status === "reviewed") return { bg: "#F59E0B22", text: "#D97706" };
  return { bg: colors.surface, text: colors.muted };
}

interface Props {
  state: LegalAcceptanceState;
  onChange: (state: LegalAcceptanceState) => void;
}

export function LegalAcceptancePanel({ state, onChange }: Props) {
  const colors = useColors();
  const [activeDoc, setActiveDoc] = useState<SignupLegalDocKey | null>(null);

  const activeRow = SIGNUP_LEGAL_DOCUMENTS.find((d) => d.key === activeDoc);

  const markReviewed = (key: SignupLegalDocKey) => {
    const reviewedKey = `${key}Reviewed` as keyof LegalAcceptanceState;
    if (!state[reviewedKey]) {
      onChange({ ...state, [reviewedKey]: true });
    }
  };

  const markAccepted = (key: SignupLegalDocKey) => {
    const acceptedKey = `${key}AcceptedAt` as keyof LegalAcceptanceState;
    const reviewedKey = `${key}Reviewed` as keyof LegalAcceptanceState;
    onChange({
      ...state,
      [reviewedKey]: true,
      [acceptedKey]: new Date().toISOString(),
    });
    setActiveDoc(null);
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 14,
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 4 }}>
        Legal Agreements (required)
      </Text>
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12, lineHeight: 18 }}>
        Open each document, scroll through it, and tap Accept. All three must be accepted before continuing.
      </Text>

      {SIGNUP_LEGAL_DOCUMENTS.map((row) => {
        const status = getDocStatus(row.key, state);
        const badge = statusColors(status, colors);
        const isAccepted = status === "accepted";

        return (
          <Pressable
            key={row.key}
            onPress={() => {
              markReviewed(row.key);
              setActiveDoc(row.key);
            }}
            accessibilityRole="button"
            accessibilityLabel={row.reviewLabel}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: isAccepted ? colors.primary : colors.border,
              backgroundColor: isAccepted ? `${colors.primary}08` : colors.background,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: isAccepted ? colors.primary : colors.border,
                backgroundColor: isAccepted ? colors.primary : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isAccepted && <IconSymbol name="checkmark" size={14} color="#fff" />}
            </View>

            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, lineHeight: 20 }}>
                {row.reviewLabel}
              </Text>
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: badge.bg,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "700", color: badge.text }}>
                  {statusLabel(status)}
                </Text>
              </View>
            </View>

            <IconSymbol name="chevron.right" size={16} color={colors.muted} />
          </Pressable>
        );
      })}

      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
        Version {CURRENT_LEGAL_VERSION}. By creating an account you also acknowledge our Safety Policy and consent to
        location processing described in our Privacy Policy{Platform.OS === "ios" ? "." : "."}
      </Text>

      {activeRow && (
        <LegalDocumentScreen
          document={activeRow.document}
          visible={activeDoc !== null}
          onClose={() => setActiveDoc(null)}
          onAccept={() => markAccepted(activeRow.key)}
          alreadyAccepted={getDocStatus(activeRow.key, state) === "accepted"}
        />
      )}
    </View>
  );
}
