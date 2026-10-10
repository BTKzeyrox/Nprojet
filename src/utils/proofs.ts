import { PostSession } from '../types';

// Toutes les preuves d'une session (début puis fin), sans doublon
export function proofsOf(p: Pick<PostSession, 'start_proof_url' | 'start_proof_urls' | 'end_proof_url' | 'end_proof_urls'>): string[] {
  const all = [
    ...(p.start_proof_urls && p.start_proof_urls.length ? p.start_proof_urls : p.start_proof_url ? [p.start_proof_url] : []),
    ...(p.end_proof_urls && p.end_proof_urls.length ? p.end_proof_urls : p.end_proof_url ? [p.end_proof_url] : []),
  ].filter(Boolean) as string[];
  return Array.from(new Set(all));
}
