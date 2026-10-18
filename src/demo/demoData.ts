import type { ChatGroup, ChatMessage, ClientContract, NewsPost, PostSession, SalaryAdvanceRequest, User } from '../types';

// Données 100 % inventées pour le mode démo (aucune vraie personne, aucun vrai montant, aucune photo).
// Tout est calculé à partir de la date du jour, avec un générateur « aléatoire » fixe : la démo est la même à chaque ouverture.

export const DEMO_ADMIN_ID = 'demo_admin';
const PRICE = 5000; // Ar par mission validée (tarif fixe de la démo)

const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const iso = (d: Date, h = 9, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x.toISOString(); };

const PEOPLE: { id: string; name: string; username: string; shift: 'day' | 'night' }[] = [
  { id: 'demo_u1', name: 'Camille Durand', username: 'camille', shift: 'day' },
  { id: 'demo_u2', name: 'Noé Lambert', username: 'noe', shift: 'day' },
  { id: 'demo_u3', name: 'Inès Moreau', username: 'ines', shift: 'day' },
  { id: 'demo_u4', name: 'Hugo Petit', username: 'hugo', shift: 'night' },
  { id: 'demo_u5', name: 'Léa Roux', username: 'lea', shift: 'day' },
  { id: 'demo_u6', name: 'Sam Fontaine', username: 'sam', shift: 'night' },
];

const MISSIONS: { title: string; type: string; desc: string }[] = [
  { title: 'Saisie des fiches du lot 12', type: 'SAISIE DE FICHES', desc: 'Saisir les fiches papier dans le logiciel de l\'entreprise. Vérifier le numéro de dossier.' },
  { title: 'Saisie des factures de septembre', type: 'SAISIE DE FICHES', desc: 'Reporter montant, date et fournisseur.' },
  { title: 'Relecture des fiches du lot 9', type: 'CONTRÔLE QUALITÉ', desc: 'Relire un échantillon de 30 fiches et noter les erreurs.' },
  { title: 'Contrôle des doublons clients', type: 'CONTRÔLE QUALITÉ', desc: 'Repérer les clients enregistrés deux fois.' },
  { title: 'Classement des dossiers du personnel', type: 'ADMINISTRATIF', desc: 'Classer et numéroter les dossiers.' },
  { title: 'Préparation des courriers du mois', type: 'ADMINISTRATIF', desc: 'Imprimer, plier et ranger par service.' },
  { title: 'Aide à l\'équipe du support', type: 'AIDE', desc: 'Répondre aux questions internes de l\'équipe.' },
  { title: 'Mise à jour du catalogue en ligne', type: 'WEB', desc: 'Corriger les prix et les descriptions des produits.' },
  { title: 'Vérification des liens du site', type: 'WEB', desc: 'Tester les liens et signaler ceux qui sont cassés.' },
  { title: 'Saisie des bons de livraison', type: 'SAISIE DE FICHES', desc: 'Saisir les bons de la semaine.' },
  { title: 'Relecture du guide interne', type: 'CONTRÔLE QUALITÉ', desc: 'Corriger les fautes et les liens du guide.' },
  { title: 'Archivage des contrats 2025', type: 'ADMINISTRATIF', desc: 'Scanner et nommer les fichiers.' },
];

export interface DemoData {
  users: User[];
  contracts: ClientContract[];
  posts: PostSession[];
  advances: SalaryAdvanceRequest[];
  messages: ChatMessage[];
  groups: ChatGroup[];
  news: NewsPost[];
}

export function buildDemoData(): DemoData {
  const r = rng(20261018);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

  // ----- Personnes -----
  const users: User[] = [
    {
      id: DEMO_ADMIN_ID, username: 'demo', name: 'Responsable Démo', role: 'admin', status: 'active', shift: 'day', is_online: true,
      avatar_url: '', phone: '', performance_badge: 'Standard', total_score_boosted: 0, total_earnings_ar: 0, pending_advance_ar: 0,
    },
    ...PEOPLE.map((p, i): User => ({
      id: p.id, username: p.username, name: p.name, role: 'employee', status: 'active', shift: p.shift, is_online: i < 3,
      avatar_url: '', phone: '', performance_badge: i === 0 ? 'Top Booster' : i === 1 ? 'Elite' : 'Standard',
      total_score_boosted: 0, total_earnings_ar: 0, pending_advance_ar: 0,
    })),
  ];

  // ----- Missions du tableau (À faire / En cours / À valider) -----
  const contracts: ClientContract[] = MISSIONS.map((m, i) => ({
    id: `demo_c${i + 1}`, post_number: i + 1, client_name: m.title, account_tag: '', game_mode: '', description: m.desc, post_type: m.type,
    proof_mode: 'type', no_account: false, current_rank: '—', target_rank: '—', initial_score: 0, current_score: 0, target_score: 0,
    recommended_shift: 'any', estimated_reward_ar: PRICE, priority: i % 5 === 0 ? 'Urgente' : 'Normale', region_server: '',
  }));

  // ----- Historique : missions des 60 derniers jours -----
  const posts: PostSession[] = [];
  let n = 0;
  for (let back = 60; back >= 1; back--) {
    const d = daysAgo(back);
    if (d.getDay() === 0) continue; // pas de dimanche
    const workers = PEOPLE.filter(() => r() > 0.25); // quelques absents
    for (const p of workers) {
      const count = r() < 0.45 ? 1 : r() < 0.25 ? 2 : 0;
      for (let k = 0; k < count; k++) {
        const m = pick(MISSIONS);
        const startH = p.shift === 'day' ? 8 + k * 3 : 20 + k;
        const rejected = r() < 0.08;
        const qty = 20 + Math.floor(r() * 80);
        n++;
        posts.push({
          id: `demo_p${n}`, employee_id: p.id, employee_name: p.name, client_name: m.title, account_tag: '', target_score: qty, initial_score: 0,
          current_score: qty, final_score: qty, remaining_score: 0, status: rejected ? 'rejected' : 'completed', shift_type: p.shift, date: ymd(d),
          start_time: `${pad(startH % 24)}:${pad(Math.floor(r() * 50))}:00`, end_time: `${pad((startH + 2) % 24)}:${pad(Math.floor(r() * 50))}:00`,
          start_proof_url: '', end_proof_url: '', calculated_ar: rejected ? 0 : PRICE, rejection_reason: rejected ? 'Capture illisible, merci de renvoyer.' : undefined,
          notes: `${qty} fiches traitées`, demo: true, created_at: iso(d, startH), updated_at: iso(d, startH + 2),
        });
      }
    }
  }
  // Aujourd'hui : une mission en cours, deux à valider
  const today = new Date();
  const live: { who: number; m: number; status: 'active' | 'pending_end' | 'pending_start' }[] = [
    { who: 0, m: 0, status: 'active' }, { who: 1, m: 2, status: 'pending_end' }, { who: 2, m: 7, status: 'pending_end' }, { who: 4, m: 4, status: 'pending_start' },
  ];
  live.forEach((l, i) => {
    const p = PEOPLE[l.who]; const m = MISSIONS[l.m];
    n++;
    posts.push({
      id: `demo_p${n}`, employee_id: p.id, employee_name: p.name, client_name: m.title, account_tag: '', target_score: 40, initial_score: 0,
      current_score: l.status === 'pending_end' ? 40 : 0, final_score: l.status === 'pending_end' ? 40 : undefined, remaining_score: l.status === 'pending_end' ? 0 : 40,
      status: l.status, shift_type: p.shift, date: ymd(today), start_time: `${pad(8 + i)}:10:00`, start_proof_url: '', post_number: l.m + 1,
      notes: l.status === 'pending_end' ? '40 fiches traitées' : undefined, demo: true, created_at: iso(today, 8 + i), updated_at: iso(today, 9 + i),
    });
  });

  // Totaux affichés dans les fiches
  for (const u of users) {
    const mine = posts.filter(p => p.employee_id === u.id && p.status === 'completed');
    u.total_earnings_ar = mine.length * PRICE;
    u.total_score_boosted = mine.reduce((a, p) => a + (p.final_score || 0), 0);
  }

  // ----- Avances -----
  const advances: SalaryAdvanceRequest[] = [
    { id: 'demo_a1', employee_id: 'demo_u3', employee_name: 'Inès Moreau', amount_ar: 40000, reason: 'Frais de transport du mois', request_date: ymd(daysAgo(12)), status: 'approved', demo: true },
    { id: 'demo_a2', employee_id: 'demo_u2', employee_name: 'Noé Lambert', amount_ar: 25000, reason: 'Facture d\'internet', request_date: ymd(daysAgo(2)), status: 'pending', demo: true },
  ];

  // ----- Messagerie -----
  const t = (daysBack: number, h: number, m: number) => iso(daysAgo(daysBack), h, m);
  const msg = (id: string, from: string, fromName: string, role: 'admin' | 'employee', to: string, text: string, ts: string, extra: Partial<ChatMessage> = {}): ChatMessage =>
    ({ id, sender_id: from, sender_name: fromName, sender_role: role, recipient_id: to, message: text, timestamp: ts, sent_ms: new Date(ts).getTime(), ...extra });
  const GROUP = 'grp_demo_saisie';
  const groups: ChatGroup[] = [{
    id: GROUP, name: 'Équipe saisie', owner_id: DEMO_ADMIN_ID, members: [DEMO_ADMIN_ID, 'demo_u1', 'demo_u2', 'demo_u3', 'demo_u5'],
    description: 'Questions et annonces sur les saisies de fiches.', created_at: t(30, 9, 0),
  }];
  const m1 = msg('demo_m1', DEMO_ADMIN_ID, 'Responsable Démo', 'admin', 'all', 'Bonjour à tous. Les nouvelles missions de la semaine sont publiées dans le tableau.', t(1, 8, 5), { pinned: true, pinned_at: t(1, 8, 6) });
  const m2 = msg('demo_m2', 'demo_u1', 'Camille Durand', 'employee', GROUP, 'Le lot 12 est terminé, je l\'envoie à valider cet après-midi.', t(0, 10, 12));
  const messages: ChatMessage[] = [
    m1,
    msg('demo_m3', 'demo_u2', 'Noé Lambert', 'employee', 'all', 'Merci, bien reçu !', t(1, 8, 20), { reactions: { '👍': [DEMO_ADMIN_ID, 'demo_u1', 'demo_u3'] } }),
    msg('demo_m4', DEMO_ADMIN_ID, 'Responsable Démo', 'admin', GROUP, 'Pensez à joindre une capture du logiciel à la fin de chaque mission.', t(2, 9, 30), { reactions: { '❤️': ['demo_u1', 'demo_u5'] } }),
    m2,
    msg('demo_m5', DEMO_ADMIN_ID, 'Responsable Démo', 'admin', GROUP, 'Très bien Camille. Je valide dès que c\'est envoyé.', t(0, 10, 20), { reply_to: { id: 'demo_m2', sender_name: 'Camille Durand', text: m2.message } }),
    msg('demo_m6', 'demo_u3', 'Inès Moreau', 'employee', DEMO_ADMIN_ID, 'Bonjour, est-ce que je peux prendre la mission « Relecture du guide interne » ?', t(0, 9, 2)),
    msg('demo_m7', DEMO_ADMIN_ID, 'Responsable Démo', 'admin', 'demo_u3', 'Oui, elle est pour toi. Bon courage !', t(0, 9, 8), { reply_to: { id: 'demo_m6', sender_name: 'Inès Moreau', text: 'Bonjour, est-ce que je peux prendre la mission « Relecture du guide interne » ?' }, reactions: { '🙏': ['demo_u3'] } }),
  ];

  // ----- Actualités -----
  const news: NewsPost[] = [
    { id: 'demo_n1', author_id: DEMO_ADMIN_ID, author_name: 'Responsable Démo', author_role: 'admin', title: 'Bienvenue dans Gestion Pro', text: 'Ceci est une démonstration avec des données inventées. Vous pouvez tout essayer : créer une mission, la prendre, la valider, écrire un message.', created_at: t(3, 9, 0), pinned: true, loves: ['demo_u1', 'demo_u2', 'demo_u4'], comments: [{ id: 'demo_nc1', user_id: 'demo_u1', user_name: 'Camille Durand', role: 'employee', text: 'Merci, c\'est très clair !', created_at: t(3, 10, 0) }], shares: 2 },
    { id: 'demo_n2', author_id: DEMO_ADMIN_ID, author_name: 'Responsable Démo', author_role: 'admin', title: 'Nouvelle règle de justificatif', text: 'À partir de lundi, une capture de l\'écran du logiciel est demandée à la fin de chaque saisie de fiches.', created_at: t(6, 14, 0), pinned: false, loves: ['demo_u3'], comments: [], shares: 0 },
    { id: 'demo_n3', author_id: 'demo_u5', author_name: 'Léa Roux', author_role: 'employee', title: '', text: 'Astuce : trier les fiches par numéro avant de commencer fait gagner du temps.', created_at: t(8, 11, 30), pinned: false, loves: [DEMO_ADMIN_ID, 'demo_u1'], comments: [], shares: 1, status: 'published' },
    { id: 'demo_n4', author_id: DEMO_ADMIN_ID, author_name: 'Responsable Démo', author_role: 'admin', title: 'Objectif du mois atteint', text: 'Bravo à toute l\'équipe : le volume de missions validées a dépassé l\'objectif du mois.', created_at: t(14, 16, 45), pinned: false, loves: PEOPLE.map(p => p.id), comments: [], shares: 3 },
  ];

  return { users, contracts, posts, advances, messages, groups, news };
}
