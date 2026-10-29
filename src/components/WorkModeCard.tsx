import React, { useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Globe, Upload } from 'lucide-react';
import { db } from '../db/store';
import type * as S from '../utils/sheets';
import { buildMissionSheet } from '../utils/missionSheet';
import { downloadExcelModel } from '../utils/sheetExport';
import { getMissionMode, getWorkMode, setMissionMode, setWorkMode, type WorkMode } from '../utils/workMode';
import { showToast } from './ToastHost';

/**
 * « Ma façon de travailler » (module 19, M19.5) : directement sur le SITE, ou sur un EXCEL externe.
 * Excel externe : le site ne prépare pas de tableau ; pour chaque mission on propose le modèle Excel (mêmes colonnes), puis « Remettre mon fichier »
 * (les lignes entrent dans le tableau de la mission, que le responsable lit comme d'habitude). On peut changer d'avis à tout moment, mission par mission.
 */
export const WorkModeCard: React.FC<{ uid: string; lang: 'fr' | 'en'; today: string; onMerge: (sheet: S.Sheet) => void; onOpen: (sheet: S.Sheet) => void }> = ({ uid, lang, today, onMerge, onOpen }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const [mode, setMode] = useState<WorkMode>(() => getWorkMode(uid));
  const [, force] = useState(0);
  useEffect(() => db.subscribe(() => force(n => n + 1)), []);
  const pending = db.getMissionsWithoutSheet();
  const choose = (m: WorkMode) => { setWorkMode(uid, m); setMode(m); force(n => n + 1); };
  const btn = 'inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-xs font-semibold cursor-pointer';
  const label = (p: { post_number?: number; client_name?: string; date?: string }) => [p.post_number != null ? `${t('Mission', 'Mission')} ${p.post_number}` : t('Mission', 'Mission'), p.client_name, p.date].filter(Boolean).join(' · ');

  const model = async (postId: string) => {
    const post = db.getPosts().find(p => p.id === postId);
    if (!post) return;
    const contract = post.post_number != null ? db.getContracts().find(c => c.post_number === post.post_number) : undefined;
    const sheet = buildMissionSheet({ postId: post.id, postNumber: post.post_number, date: post.date, type: contract?.post_type, lang, now: new Date().toISOString() });
    if (!sheet) { showToast(t('Impossible de préparer le modèle.', 'Cannot prepare the model.'), 'error'); return; }
    try { await downloadExcelModel(sheet, today, lang); } catch { showToast(t('Export Excel impossible.', 'Excel export failed.'), 'error'); }
  };
  const merge = (postId: string) => { const sh = db.prepareMissionSheetNow(postId); if (sh) onMerge(sh); else showToast(t('Cette mission a déjà son tableau : ouvre-le dans la liste.', 'This mission already has its table: open it in the list.'), 'info'); };
  const onSite = (postId: string) => { setMissionMode(uid, postId, 'site'); const sh = db.prepareMissionSheetNow(postId); if (sh) onOpen(sh); };

  const choice = (m: WorkMode, icon: React.ReactNode, title: string, text: string) => (
    <button type="button" onClick={() => choose(m)} aria-pressed={mode === m} data-testid={`work-mode-${m}`} className={`flex-1 min-w-[150px] text-left rounded-lg border px-3 py-2.5 cursor-pointer ${mode === m ? 'border-sky-500 bg-sky-500/10' : 'border-slate-700 hover:bg-slate-700/40'}`}>
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">{icon}{title}</span>
      <span className="block text-[11px] text-slate-400 mt-0.5">{text}</span>
    </button>
  );
  return (
    <section className="border border-slate-700 rounded-xl p-3 space-y-3" data-testid="work-mode-card" aria-label={t('Ma façon de travailler', 'My way of working')}>
      <h3 className="text-sm font-bold text-slate-100">{t('Ma façon de travailler', 'My way of working')}</h3>
      <div className="flex flex-wrap gap-2">
        {choice('site', <Globe className="w-4 h-4" />, t('Sur le site', 'On the site'), t('Le tableau de chaque mission est préparé pour toi, tu le remplis ici.', 'The table of each mission is prepared for you, you fill it here.'))}
        {choice('excel', <FileSpreadsheet className="w-4 h-4" />, t('Excel externe', 'External Excel'), t('Tu remplis un fichier Excel sur ton appareil, puis tu le remets au site.', 'You fill an Excel file on your device, then hand it in to the site.'))}
      </div>
      {pending.length > 0 && (
        <ul className="space-y-2" aria-label={t('Missions sans tableau', 'Missions without a table')}>
          {pending.map(p => (
            <li key={p.id} className="border border-slate-700 rounded-lg p-2.5 space-y-2" data-testid="mission-without-sheet">
              <div className="text-sm text-slate-100 break-words">{label(p)} <span className="text-[11px] text-slate-400">{getMissionMode(uid, p.id) === 'excel' ? t('(Excel externe)', '(external Excel)') : ''}</span></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={`${btn} border-slate-600 text-slate-200`} onClick={() => void model(p.id)}><Download className="w-4 h-4" />{t('Modèle Excel à remplir', 'Excel model to fill')}</button>
                <button type="button" className={`${btn} border-sky-500 bg-sky-600 text-white`} onClick={() => merge(p.id)}><Upload className="w-4 h-4" />{t('Remettre mon fichier', 'Hand in my file')}</button>
                <button type="button" className={`${btn} border-slate-600 text-slate-200`} onClick={() => onSite(p.id)}><Globe className="w-4 h-4" />{t('Travailler sur le site', 'Work on the site')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {mode === 'excel' && pending.length === 0 && <p className="text-[11px] text-slate-400">{t('Tu travailles sur Excel externe : dès que tu démarres une mission, elle apparaît ici avec son modèle Excel.', 'You work on external Excel: as soon as you start a mission it appears here with its Excel model.')}</p>}
    </section>
  );
};
