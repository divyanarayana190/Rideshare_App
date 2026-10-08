/**
 * Help Center — Live chat, FAQs, tickets, contact info.
 * Layout: Header → Search → Quick Actions → Chat Banner → Contact Us → FAQs (collapsible) → Tickets → Floating Chat
 */
import { useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useNotification } from "@/lib/use-notification";
import { trpc } from "@/lib/trpc";

// ─── constants ──────────────────────────────────────────────────────────────

const TICKET_CATEGORIES = [
  { value: "ride_issue", label: "Ride Issue", emoji: "🚗" },
  { value: "payment", label: "Payment", emoji: "💳" },
  { value: "account", label: "Account", emoji: "👤" },
  { value: "driver", label: "Driver", emoji: "🧑‍✈️" },
  { value: "safety", label: "Safety", emoji: "🛡️" },
  { value: "app_bug", label: "App Bug", emoji: "🐛" },
  { value: "feedback", label: "Feedback", emoji: "💡" },
  { value: "other", label: "Other", emoji: "📌" },
] as const;

const FAQ_TABS = ["all", "general", "rides", "payments", "safety", "account", "driver"] as const;

const STATUS_COLORS: Record<string, string> = {
  open: "#1E88FF", in_progress: "#F59E0B", resolved: "#16A34A", closed: "#6B7280",
};
const STATUS_LABELS: Record<string, string> = {
  open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed",
};
const CATEGORY_LABELS: Record<string, string> = {
  ride_issue: "Ride Issue", payment: "Payment", account: "Account", driver: "Driver",
  safety: "Safety", app_bug: "App Bug", feedback: "Feedback", other: "Other",
  general: "General", rides: "Rides", payments: "Payments",
};

// ─── component ──────────────────────────────────────────────────────────────

export default function HelpSupportScreen() {
  const colors = useColors();
  const router = useRouter();
  const notify = useNotification();
  const scrollRef = useRef<any>(null);
  const ticketsSectionRef = useRef<any>(null);

  // ── FAQ state
  const [faqTab, setFaqTab] = useState<string>("all");
  const [faqSearch, setFaqSearch] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [faqCollapsed, setFaqCollapsed] = useState(false);

  // ── Ticket form state
  const [showForm, setShowForm] = useState(false);
  const [formCategory, setFormCategory] = useState<string>("ride_issue");
  const [formSubject, setFormSubject] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formRideId, setFormRideId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Ticket list state
  const [ticketFilter, setTicketFilter] = useState<string | undefined>(undefined);

  // ── Data
  const { data: faqs = [], isLoading: faqsLoading } = trpc.support.getFAQs.useQuery(
    faqTab === "all" ? undefined : { category: faqTab as any },
  );
  const { data: tickets = [], isLoading: ticketsLoading, refetch: refetchTickets } =
    trpc.support.getMyTickets.useQuery(ticketFilter ? { status: ticketFilter as any } : undefined);
  const createTicketMut = trpc.support.createTicket.useMutation();

  // Live chat sessions
  const { data: chatSessions = [] } = trpc.liveChat.getMySessions.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const activeChat = (chatSessions as any[]).find(
    (s: any) => s.status === "waiting" || s.status === "active",
  );

  // ── Filtered FAQs
  const filteredFaqs = useMemo(() => {
    if (!faqSearch.trim()) return faqs;
    const q = faqSearch.toLowerCase();
    return (faqs as any[]).filter(
      (f: any) => f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q),
    );
  }, [faqs, faqSearch]);

  // ── Submit ticket
  const handleSubmitTicket = useCallback(async () => {
    if (formSubject.trim().length < 5) {
      notify.showError("Subject must be at least 5 characters.");
      return;
    }
    if (formDescription.trim().length < 10) {
      notify.showError("Description must be at least 10 characters.");
      return;
    }
    setSubmitting(true);
    const loadingId = notify.showLoading("Submitting ticket…");
    try {
      await createTicketMut.mutateAsync({
        category: formCategory as any,
        subject: formSubject.trim(),
        description: formDescription.trim(),
        rideId: formRideId ? parseInt(formRideId) : undefined,
      });
      notify.dismiss(loadingId);
      notify.showSuccess("✅ Ticket submitted! We'll get back to you soon.");
      setFormSubject("");
      setFormDescription("");
      setFormRideId("");
      setShowForm(false);
      refetchTickets();
    } catch (err: any) {
      notify.dismiss(loadingId);
      notify.showError(err.message || "Failed to submit ticket.");
    } finally {
      setSubmitting(false);
    }
  }, [formCategory, formSubject, formDescription, formRideId, createTicketMut, refetchTickets, notify]);

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-background">
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* ──── Header ──── */}
        <View style={{ backgroundColor: "#1E88FF", paddingBottom: 20, paddingTop: 8, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <IconSymbol name="chevron.left" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: "#fff" }]}>Help Center</Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Search bar inside header */}
          <View style={styles.searchBarWrapper}>
            <View style={styles.searchBarInner}>
              <IconSymbol name="magnifyingglass" size={16} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for help..."
                placeholderTextColor="#9CA3AF"
                value={faqSearch}
                onChangeText={setFaqSearch}
              />
              {faqSearch.length > 0 && (
                <TouchableOpacity onPress={() => setFaqSearch("")}>
                  <IconSymbol name="xmark.circle.fill" size={16} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* ──── Quick Actions ──── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickCard, { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5" }]}
            onPress={() => {
              if (Platform.OS === "web") window.open("tel:911");
              else Linking.openURL("tel:911");
            }}
          >
            <Text style={styles.quickIcon}>🆘</Text>
            <Text style={[styles.quickLabel, { color: "#DC2626" }]}>Emergency{"\n"}SOS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickCard, { backgroundColor: "#DBEAFE", borderColor: "#7EC8FF" }]}
            onPress={() => router.push("/live-chat" as Href)}
          >
            <Text style={styles.quickIcon}>💬</Text>
            <Text style={[styles.quickLabel, { color: "#1E88FF" }]}>Chat with{"\n"}Support</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickCard, { backgroundColor: "#F3E8FF", borderColor: "#C4B5FD" }]}
            onPress={() => {
              ticketsSectionRef.current?.measureLayout?.(
                scrollRef.current as any,
                (_x: number, y: number) => scrollRef.current?.scrollTo({ y, animated: true }),
                () => {},
              );
            }}
          >
            <Text style={styles.quickIcon}>🎫</Text>
            <Text style={[styles.quickLabel, { color: "#7C3AED" }]}>My{"\n"}Tickets</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickCard, { backgroundColor: "#D1FAE5", borderColor: "#6EE7B7" }]}
            onPress={() => Linking.openURL("mailto:support@yoo.app")}
          >
            <Text style={styles.quickIcon}>📧</Text>
            <Text style={[styles.quickLabel, { color: "#059669" }]}>Email{"\n"}Us</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ──── Active Chat Banner ──── */}
        {activeChat && (
          <TouchableOpacity
            style={styles.chatBanner}
            onPress={() => router.push((`/live-chat?sessionId=${activeChat.sessionId}`) as Href)}
          >
            <View style={styles.chatBannerDot} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.chatBannerTitle}>
                {activeChat.status === "waiting" ? "Waiting for agent..." : "Chat in progress"}
              </Text>
              <Text style={styles.chatBannerSub} numberOfLines={1}>
                {activeChat.issueDescription}
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color="#fff" />
          </TouchableOpacity>
        )}

        {/* ──── Contact Us ──── */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Contact Us</Text>
          {[
            { icon: "phone.fill" as const, label: "Call Us", value: "+1 (800) 555-RIDE", action: () => Linking.openURL("tel:+18005557433"), color: "#16A34A" },
            { icon: "envelope.fill" as const, label: "Email", value: "support@yoo.app", action: () => Linking.openURL("mailto:support@yoo.app"), color: "#1E88FF" },
            { icon: "clock.fill" as const, label: "Hours", value: "24/7 Available", action: undefined, color: "#F59E0B" },
          ].map((item, i) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.contactRow, i < 2 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              onPress={item.action}
              disabled={!item.action}
            >
              <View style={[styles.contactIconBox, { backgroundColor: item.color + "15" }]}>
                <IconSymbol name={item.icon} size={18} color={item.color} />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 12, color: colors.muted }}>{item.label}</Text>
                <Text style={{ fontSize: 15, fontWeight: "600", color: colors.foreground }}>{item.value}</Text>
              </View>
              {item.action && <IconSymbol name="chevron.right" size={14} color={colors.muted} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* ──── FAQ Section (Collapsible) ──── */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.sectionHeaderRow}
            onPress={() => setFaqCollapsed(!faqCollapsed)}
            activeOpacity={0.7}
          >
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>
              Frequently Asked Questions
            </Text>
            <View style={[styles.collapseBtn, { backgroundColor: colors.background }]}>
              <IconSymbol
                name={faqCollapsed ? "chevron.down" : "chevron.up"}
                size={14}
                color={colors.muted}
              />
            </View>
          </TouchableOpacity>

          {!faqCollapsed && (
            <View style={{ marginTop: 14 }}>
              {/* Category tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {FAQ_TABS.map((tab) => (
                  <TouchableOpacity
                    key={tab}
                    style={[
                      styles.tabBtn,
                      {
                        backgroundColor: faqTab === tab ? colors.primary : colors.background,
                        borderColor: faqTab === tab ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setFaqTab(tab)}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: faqTab === tab ? "#fff" : colors.muted }}>
                      {tab === "all" ? "All" : CATEGORY_LABELS[tab] ?? tab}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {faqsLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
              ) : filteredFaqs.length === 0 ? (
                <Text style={{ textAlign: "center", color: colors.muted, paddingVertical: 20, fontSize: 14 }}>
                  No FAQs found.
                </Text>
              ) : (
                (filteredFaqs as any[]).map((faq: any, idx: number) => (
                  <TouchableOpacity
                    key={faq.id}
                    style={[
                      styles.faqItem,
                      idx < (filteredFaqs as any[]).length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    ]}
                    onPress={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.faqHeader}>
                      <Text style={[styles.faqQuestion, { color: colors.foreground, flex: 1 }]}>{faq.question}</Text>
                      <View style={[styles.faqArrow, {
                        backgroundColor: expandedFaq === faq.id ? colors.primary + "15" : colors.background,
                      }]}>
                        <IconSymbol
                          name={expandedFaq === faq.id ? "chevron.up" : "chevron.down"}
                          size={12}
                          color={expandedFaq === faq.id ? colors.primary : colors.muted}
                        />
                      </View>
                    </View>
                    {expandedFaq === faq.id && (
                      <View style={[styles.faqAnswerBox, { backgroundColor: colors.background }]}>
                        <Text style={[styles.faqAnswer, { color: colors.muted }]}>{faq.answer}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>

        {/* ──── Submit a Ticket ──── */}
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity style={styles.sectionHeaderRow} onPress={() => setShowForm(!showForm)}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>
                Submit a Ticket
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                Need more help? Create a support ticket
              </Text>
            </View>
            <View style={[styles.collapseBtn, { backgroundColor: showForm ? colors.primary : colors.background }]}>
              <IconSymbol
                name={showForm ? "chevron.up" : "plus"}
                size={14}
                color={showForm ? "#fff" : colors.primary}
              />
            </View>
          </TouchableOpacity>

          {showForm && (
            <View style={{ marginTop: 14 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {TICKET_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.catChip,
                      {
                        backgroundColor: formCategory === cat.value ? colors.primary : colors.background,
                        borderColor: formCategory === cat.value ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setFormCategory(cat.value)}
                  >
                    <Text style={{ fontSize: 14 }}>{cat.emoji}</Text>
                    <Text style={{
                      fontSize: 12, fontWeight: "600", marginLeft: 4,
                      color: formCategory === cat.value ? "#fff" : colors.muted,
                    }}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Subject</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Brief summary of your issue"
                placeholderTextColor={colors.muted}
                value={formSubject}
                onChangeText={setFormSubject}
                maxLength={500}
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="Describe your issue in detail..."
                placeholderTextColor={colors.muted}
                value={formDescription}
                onChangeText={setFormDescription}
                multiline
                numberOfLines={5}
                maxLength={5000}
                textAlignVertical="top"
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Ride ID (optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                placeholder="e.g. 42"
                placeholderTextColor={colors.muted}
                value={formRideId}
                onChangeText={setFormRideId}
                keyboardType="number-pad"
              />

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]}
                onPress={handleSubmitTicket}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Ticket</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ──── My Tickets ──── */}
        <View
          ref={ticketsSectionRef}
          style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>My Tickets</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {[
              { label: "All", value: undefined },
              { label: "Open", value: "open" },
              { label: "In Progress", value: "in_progress" },
              { label: "Resolved", value: "resolved" },
            ].map((f) => (
              <TouchableOpacity
                key={f.label}
                style={[
                  styles.tabBtn,
                  {
                    backgroundColor: ticketFilter === f.value ? colors.primary : colors.background,
                    borderColor: ticketFilter === f.value ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setTicketFilter(f.value)}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: ticketFilter === f.value ? "#fff" : colors.muted }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {ticketsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : (tickets as any[]).length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 24 }}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>📭</Text>
              <Text style={{ color: colors.muted, fontSize: 14 }}>No tickets found</Text>
            </View>
          ) : (
            (tickets as any[]).slice(0, 5).map((ticket: any) => (
              <TouchableOpacity
                key={ticket.id}
                style={[styles.ticketCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={() => router.push((`/ticket-detail?ticketId=${ticket.ticketId}`) as Href)}
              >
                <View style={styles.ticketRow}>
                  <Text style={[styles.ticketSubject, { color: colors.foreground }]} numberOfLines={1}>
                    {ticket.subject}
                  </Text>
                  <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[ticket.status] ?? "#6B7280") + "20" }]}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: STATUS_COLORS[ticket.status] ?? "#6B7280" }}>
                      {STATUS_LABELS[ticket.status] ?? ticket.status}
                    </Text>
                  </View>
                </View>
                <View style={styles.ticketRow}>
                  <View style={[styles.categoryBadge, { backgroundColor: colors.primary + "12" }]}>
                    <Text style={{ fontSize: 10, fontWeight: "600", color: colors.primary }}>
                      {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, color: colors.muted }}>
                    {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : ""}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
          {(tickets as any[]).length > 5 && (
            <TouchableOpacity
              style={{ alignItems: "center", paddingVertical: 8 }}
              onPress={() => {
                ticketsSectionRef.current?.measureLayout?.(
                  scrollRef.current as any,
                  (_x: number, y: number) => scrollRef.current?.scrollTo({ y, animated: true }),
                  () => {},
                );
              }}
            >
              <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>
                View All Tickets ({(tickets as any[]).length})
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ──── Floating Chat Button ──── */}
      <TouchableOpacity
        style={styles.floatingChat}
        onPress={() => {
          if (activeChat) {
            router.push((`/live-chat?sessionId=${activeChat.sessionId}`) as Href);
          } else {
            router.push("/live-chat" as Href);
          }
        }}
        activeOpacity={0.8}
      >
        <IconSymbol name="bubble.left.fill" size={24} color="#fff" />
        {activeChat && <View style={styles.floatingBadge} />}
      </TouchableOpacity>
    </ScreenContainer>
  );
}

// ─── styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
  },
  backBtn: { width: 32, alignItems: "center" },
  headerTitle: { fontSize: 22, fontWeight: "800" },

  searchBarWrapper: { paddingHorizontal: 16, marginTop: 4 },
  searchBarInner: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#1F2937" },

  quickActions: { paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  quickCard: {
    width: 88, height: 88, borderRadius: 16, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  quickIcon: { fontSize: 26, marginBottom: 4 },
  quickLabel: { fontSize: 11, fontWeight: "700", textAlign: "center", lineHeight: 14 },

  chatBanner: {
    marginHorizontal: 16, marginBottom: 12, backgroundColor: "#1E88FF",
    borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center",
  },
  chatBannerDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: "#22C55E",
  },
  chatBannerTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  chatBannerSub: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 1 },

  section: {
    marginHorizontal: 16, marginBottom: 14, borderRadius: 18, borderWidth: 1, padding: 16,
  },
  sectionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 12 },
  sectionHeaderRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  collapseBtn: {
    width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center",
  },

  contactRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  contactIconBox: {
    width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center",
  },

  tabBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 8,
  },

  faqItem: { paddingVertical: 12 },
  faqHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  faqQuestion: { fontSize: 14, fontWeight: "600" },
  faqArrow: {
    width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
  },
  faqAnswerBox: {
    marginTop: 10, borderRadius: 10, padding: 12,
  },
  faqAnswer: { fontSize: 13, lineHeight: 20 },

  catChip: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, marginRight: 8,
  },

  fieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  input: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, marginBottom: 12,
  },
  textArea: { minHeight: 100, textAlignVertical: "top" },
  submitBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  ticketCard: {
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10,
  },
  ticketRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4,
  },
  ticketSubject: { fontSize: 14, fontWeight: "600", flex: 1, marginRight: 8 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  categoryBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },

  floatingChat: {
    position: "absolute", bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: "#1E88FF", alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  floatingBadge: {
    position: "absolute", top: 4, right: 4,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: "#EF4444", borderWidth: 2, borderColor: "#fff",
  },
});
