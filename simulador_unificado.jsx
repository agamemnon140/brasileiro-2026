import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';

// ============================================================================
// SIMULADOR UNIFICADO BRASILEIRÃO 2026 v4.44
// Motor único | Config: total+pesoCasa | Copa do Brasil | Datas por rodada
// Dados atualizados até 08/06/2026 | A:R18 | B:R12 parc. | C:R9 | D:R10 parc. | CB:R16 (editável)
// v4.45: +27 jogos reconciliados 1:1 vs Tabelas Detalhadas CBF (08/06). B R12 (3 antecipados:
//        Operário-PR 2×1 Juventude, Criciúma 1×0 Londrina, CRB 2×3 São Bernardo) e D R10 parcial
//        (24 jogos). Auditoria completa das 4 séries: 0 placares divergentes, 0 jogos faltantes.
// v4.44: (1) Ao Vivo passa a abrir com os MESMOS times default do pré-jogo (Flamengo×Palmeiras).
//        (2) Série D, Grupos>Probabilidades: clique num time abre detalhe (pts p10/p50/p90, posição
//        final 1º-4º, F3/Oit/QF) e cada grupo mostra o corte de pontos por posição. (3) Aba Monte
//        Carlo da Série D não tem mais filtro por grupo (a visão por grupo vive em Grupos).
// v4.43: Série D — MC voltou a ser aba própria; Grupos com sub-abas; ao-vivo alinhado ao pré-jogo.
// v4.42: reorganização de UX (UF dos times, R16 editável, Confronto+Ao Vivo, Calibração no Config).
// v4.36: [feature #6] Aba "Confronto" (H2H). v4.35: [feature #7] Validador de fixtures.
// v4.34: + rodada mais recente das 4 séries (A R18, B R11, C R9, D R9 completa),
//        reconciliada 1:1 vs Tabelas Detalhadas CBF (01-03/06); 5 placares D retificados.
// v4.33: validação dos fixtures de todas as rodadas vs CBF (A 38/38·B 38/38·C 19/19·D 480/480).
// v4.32: + Série D R9 parcial (23 jogos até 30/05). v4.31: auditoria A e C vs CBF oficial.
// v4.14: defaults agora são Conservador (α atk:0.05, def:0.08, kElo:16) + Drift
//        Alto (σElo:15). DEFAULT_CFG.defaultAlpha='conservador', cfg.drift=15,
//        dashDrift inicial=15. Justifica-se: combinação de evolução suave dos
//        ratings (α baixo evita overreact a jogos pontuais) com drift alto
//        (modela incerteza estrutural — lesões, mudanças de técnico, etc).
// v4.13: HOTFIX trava na Série A em 20% — v4.12 introduziu IIFE em cortes que
//        referenciava `sk` dentro de simMC_finalize, mas essa função não recebe sk
//        (só recebe times/ct/etc). ReferenceError silencioso fazia onDone nunca
//        ser chamado e travava a barra de progresso. Fix: simMC_finalize agora
//        aceita parâmetro nReb explícito; ambas chamadas (simMC sync linha 253,
//        simMC_async linha 413) passam sk==='C'?2:4.
// v4.12: fix Série C 2026 com apenas 2 rebaixados (CBF mudou formato, antes eram 4).
//        SC_META ganha nReb:2 e zonas.z4:19; outras METAS ganham nReb:4. simMC_single
//        e cortes z4 agora sk-aware (sk==='C'?2:4). ZonasLegend e display Z4 usam
//        meta.nReb dinamicamente. Fix crítico aba R32 Copa BR: cbScores agora
//        inicializa de CB_RES_IDA/VOLTA via lazy useState (antes começava vazio,
//        forçando re-simulação dos 16 jogos já jogados na "1 Sim rápido" e doMC do
//        componente). Mapeamento: g1a=ida.ga, g1b=ida.gb, g2a=volta.gb (visitante
//        volta=time-a), g2b=volta.ga (mandante volta=time-b).
// v4.11: ingestão massiva de resultados reais até 20/05. SA +R14/15/16 (30 jogos),
//        SB +R7/8/9 (30 jogos), SC +R5/6/7 (30 jogos), CB R32 volta completa (16
//        jogos, 4 zebras: Vitória elim Flamengo, Remo elim Bahia, Chape elim
//        Botafogo, Juventude elim São Paulo). Bonus fix: SB_TAB R7/R8/R9 e R26/
//        R27/R28 (returno espelhado) reescritos para casar com tabela CBF oficial
//        — o TAB algorítmico anterior tinha bug GOI duplicado em R9/R28 (validador
//        Python confirma 0 duplicatas após fix). SD R5-R7 (144 jogos) ficou
//        pendente nesta passada: scope grande demais por turno de pesquisa.
// v4.2: drift agora atua em Elo + atk/def; cap de 500 sims da D removido
// v4.3: fix crítico Série D — pairKey(par+turno) substitui o find(casa/fora/rodada)
//       exato. Antes: 125 de 143 jogos reais silenciosamente ignorados. Snapshot
//       pré-computado via prepareSerieDState (também reduz custo de simulação).
// v4.5: UX Rodada 1 — sort clicável em todas as tabelas (Ratings/MC/CB); coluna
//       "ELO ini" separada do "ELO atual"; dashboard cards top-10; slice(48)
//       removido da D; glass morphism nos cards; transitions nos hovers;
//       ZonasLegend reutilizado em Classificação e MC.
// v4.6: UX Rodada 2 — propagação do dashboard p/ abas (Simular Tudo + sync);
//       checkboxes A/B/C/D/CB no header; busca + export CSV em todas tabelas;
//       simMC_async e simMC_D_async com progresso real via requestAnimationFrame;
//       mini-histograma inline (Sparkbar) na tabela MC mostra distribuição de
//       pontos finais por time com escala comum.
// v4.7: dashboard como canal único de Monte Carlo — botões MC removidos das
//       abas individuais (só "1 Sim rápido" permanece); drift dropdown no
//       dashboard (Off/Baixo/Médio/Alto) sobrescreve cfg.drift no runAll;
//       opção 10k sims; cards B/C mostram acesso% (em vez de título%); Série C
//       ganha simulação do quadrangular final (top-8 em 2 grupos, top-2 de cada
//       acessam, final 1ºA×1ºB define campeão); Série D expõe todas as fases
//       (Cl/1°Gr/F2/Oit/QF/SF/Fin/Ac/T) + visão por grupo expansível; Elo
//       final (média sobre N simulações) visível em todas as MCs.
// v4.8: Série B ganha simulação do novo playoff de acesso CBF 2026 (top-2 direto
//       + 3º×6º e 4º×5º ida-volta, 2 vencedores sobem). Campos bPlayoff / bAccess
//       expostos em MC+dashboard+CSV. Drift atk/def calibrado (razão σ_ad/σ_elo
//       de 0.002 → 0.008): impacto em λ agora é comparável ao drift Elo puro
//       (SD pts do favorito passa de 5.2 para 9.0 com drift alto). Filtro de
//       grupo no MC da Série D permite ver só 1 dos 16 grupos. Dashboard cards
//       redesenhados para legibilidade (fonte maior, grid responsivo revisado,
//       title={nome} para hover mostrar nome completo quando truncado).
// v4.9: bug fix aba MC da Série C (IIFEs aninhados removidos, `ptsGlobal`
//       via useMemo, `fmt()` helper robusto a null/undefined); dashboard mostra
//       top-8 por padrão com botão "▼ Ver todos" para expandir até o último time
//       (inclui % rebaixamento para A/B/C e "F3% — top-32 da Série D" para Série D,
//       aproximado como 1 - f3, ou seja, não chegou à 3ª fase = top-32 do
//       mata-mata); Série D ganha histograma de pontos por time na visão por
//       grupo (Sparkbar roxo, escala comum entre todos os grupos); final da
//       Série C corrigida para ida e volta (era jogo único neutro — regulamento
//       CBF 2025/26 confirma ida+volta com empate agregado → pênaltis; mandante
//       da volta = melhor campanha no quadrangular); nova aba "Chaves" em B/C/D
//       e Copa BR mostra cruzamentos mais prováveis (top-3 adversários por fase
//       de mata-mata com % ao longo das N simulações). Engines B/C/D/CB agora
//       trackam matchups[time][fase] durante as sims; normalizado no finalize;
//       helper minMax() (loop) substitui Math.min/max(...arr) que estourava
//       call stack com arrays grandes (Série D tem 96 × 10k = 960k samples).
// v4.10: Série D tracka posição 1º-6º no grupo (posGr = [p1..p6] normalizado);
//        aba Grupos mostra distribuição completa por time com cores graduais
//        (top-4 em verde, zona 5-6 em vermelho/âmbar). Todas as séries expõem
//        atk/def inicial, final (média das sims) e delta em tabela expansível
//        na aba MC (positivos/negativos coloridos por impacto). Copa BR agora
//        usa Elos+atk/def EVOLUÍDOS das sims A/B/C/D quando disponíveis (ex:
//        Palmeiras def 0.60→0.56 após rodadas reais dispara título na CB de
//        22% para 39%). Banner azul na MC da CB indica quando ratings são
//        evoluídos. Engine simMC_CB agora aceita teamAD (atk/def override)
//        além do teamElos.
// v4.4: painel "Integridade dos Dados" em Config. Função global dataHealthReport
//       consolida diagnóstico A/B/C (match exato) e D (via pairKey), com toggle
//       para inspecionar resultados sem fixture correspondente.
// ============================================================================

const poissonProb = (l,k) => { let p=Math.exp(-l); for(let i=1;i<=k;i++) p*=l/i; return p; };
const poissonRandom = (l) => { if(l<=0) return 0; const L=Math.exp(-l); let k=0,p=1; do{k++;p*=Math.random();}while(p>L); return k-1; };
const suavLog = (s) => Math.sign(s)*Math.log1p(Math.abs(s));


// === ESCUDOS REAIS (Sofascore CDN + iniciais como fallback via onError DOM) ===
const TEAM_COLORS = {'Flamengo':'#8C1D18','Palmeiras':'#006437','Cruzeiro':'#003DA5','Botafogo':'#000','Fluminense':'#880038','Bahia':'#004A94','São Paulo':'#E40613','Internacional':'#E30613','Grêmio':'#0A6EB4','Santos':'#000','Corinthians':'#000','Vasco':'#000','Atlético-MG':'#000','Vitória':'#C8102E','Coritiba':'#006B3F','Athletico-PR':'#B71C1C','Chapecoense':'#006B3F','Remo':'#003DA5','Mirassol':'#FFD700','Red Bull Bragantino':'#E30613','Fortaleza':'#C8102E','Ceará':'#000','Sport':'#C8102E','Juventude':'#006B3F','Criciúma':'#FFD700','Goiás':'#006B3F','CRB':'#C8102E','Avaí':'#003DA5','Cuiabá':'#006B3F','Vila Nova':'#C8102E','América-MG':'#006B3F','Náutico':'#C8102E','Ponte Preta':'#000','Londrina':'#003DA5','Novorizontino':'#FFD700','Botafogo-SP':'#C8102E','Athletic':'#000','São Bernardo':'#003DA5','Operário-PR':'#000','Atlético-GO':'#C8102E','Paysandu':'#003DA5','Guarani':'#006B3F','Figueirense':'#000','Brusque':'#FFD700','Ituano':'#C8102E','Volta Redonda':'#FFD700','Santa Cruz':'#C8102E','Amazonas':'#006B3F','Ferroviária':'#8B0000','Caxias':'#8B0000','Maringá':'#003DA5','Confiança':'#003DA5','Ypiranga':'#006B3F','Botafogo-PB':'#000'};
const TEAM_IDS = {'Flamengo':1961,'Palmeiras':1963,'Cruzeiro':1954,'Botafogo':1958,'Fluminense':1962,'Bahia':1955,'São Paulo':1981,'Internacional':1966,'Grêmio':5926,'Santos':1968,'Corinthians':1957,'Vasco':1974,'Atlético-MG':1977,'Vitória':2017,'Coritiba':7768,'Athletico-PR':1960,'Chapecoense':7315,'Remo':7705,'Mirassol':7773,'Red Bull Bragantino':7710,'Fortaleza':1965,'Ceará':2025,'Sport':1999,'Juventude':7316,'Criciúma':7702,'Goiás':1959,'CRB':7696,'Avaí':7698,'Cuiabá':7770,'Vila Nova':7697,'América-MG':7699,'Náutico':7700,'Ponte Preta':7703,'Londrina':7766,'Novorizontino':80370,'Botafogo-SP':7771,'Operário-PR':7767,'Atlético-GO':7706,'Paysandu':7704,'Guarani':7774,'Figueirense':7695,'Brusque':211251,'Ituano':7907,'Volta Redonda':7769,'Santa Cruz':7701,'Amazonas':394078,'Ferroviária':7909,'Caxias':7708,'Botafogo-PB':7772,'Confiança':7775,'Athletic':363380,'São Bernardo':211252,'Maringá':211254,'Ypiranga':7776};
const Badge = ({name, size}) => {
  const s = size || 18;
  const tid = TEAM_IDS[name];
  const ab = (name||'').replace(/-[A-Z]{2}$/,'').split(/[\s-]/).map(function(w){return w[0]||'';}).join('').slice(0,3).toUpperCase();
  const bg = TEAM_COLORS[name] || (()=>{let h=0;for(let i=0;i<(name||'').length;i++)h=(name||'').charCodeAt(i)+((h<<5)-h);return 'hsl('+(Math.abs(h)%360)+',40%,32%)';})();
  const txt = bg==='#FFD700'?'#000':'#fff';
  const bdr = bg==='#FFD700'?'#8B6914':bg==='#000'?'#444':bg;
  return (<span className="inline-block relative flex-shrink-0" style={{width:s,height:s,marginRight:3,verticalAlign:'middle'}}>
    <span className="absolute inset-0 inline-flex items-center justify-center rounded-full font-bold" style={{background:bg,color:txt,border:'1.5px solid '+bdr,fontSize:s*0.34,lineHeight:1}}>{ab}</span>
    {tid&&<img src={'https://api.sofascore.app/api/v1/team/'+tid+'/image'} width={s} height={s}
      className="absolute inset-0 rounded-full object-contain bg-white" style={{border:'1.5px solid #555'}}
      onError={function(e){e.target.style.display='none';}} loading="lazy"/>}
  </span>);
};
// Mapa time→UF (A/B/C/Copa). A Série D é preenchida a partir de SD_INFO mais abaixo.
const UF_MAP={'Flamengo':'RJ','Palmeiras':'SP','Cruzeiro':'MG','Mirassol':'SP','Fluminense':'RJ','Botafogo':'RJ','Bahia':'BA','São Paulo':'SP','Internacional':'RS','Grêmio':'RS','Santos':'SP','Corinthians':'SP','Vasco':'RJ','Red Bull Bragantino':'SP','Vitória':'BA','Coritiba':'PR','Chapecoense':'SC','Remo':'PA','Fortaleza':'CE','Ceará':'CE','Sport':'PE','Juventude':'RS','Criciúma':'SC','Goiás':'GO','Novorizontino':'SP','CRB':'AL','Avaí':'SC','Cuiabá':'MT','Vila Nova':'GO','Athletic':'MG','Ponte Preta':'SP','Londrina':'PR','Náutico':'PE','São Bernardo':'SP','Ferroviária':'SP','Amazonas':'AM','Volta Redonda':'RJ','Paysandu':'PA','Caxias':'RS','Brusque':'SC','Guarani':'SP','Floresta':'CE','Confiança':'SE','Ypiranga':'RS','Maringá':'PR','Ituano':'SP','Figueirense':'SC','Anápolis':'GO','Itabaiana':'SE','Inter de Limeira':'SP','Barra':'SC','Maranhão':'MA','Santa Cruz':'PE','Jacuipense':'BA'};
const ufOf=(name)=>{if(/-[A-Z]{2}$/.test(name))return '';return UF_MAP[name]||'';};
const TN = ({name}) => {const uf=ufOf(name);return(<span className="inline-flex items-center gap-0"><Badge name={name} size={18}/>{name}{uf&&<span className="text-slate-500 text-[0.82em] ml-0.5">·{uf}</span>}</span>);};

// === CONFIG DEFAULT ===
const DEFAULT_CFG = {
  targetRatio: 3.0, homeAdv: 100, drift: 15, defaultAlpha: 'conservador',
  alphas: {
    conservador: { atk:0.05, def:0.08, kElo:16, label:'Conservador' },
    base:        { atk:0.10, def:0.16, kElo:32, label:'Base' },
    agressivo:   { atk:0.20, def:0.32, kElo:48, label:'Agressivo' },
  },
  // Gols por jogo: total × pesoCasa = λ_casa; total × (1-pesoCasa) = λ_fora
  lambdas: {
    A: { total:2.50, pesoCasa:0.652 }, B: { total:2.20, pesoCasa:0.583 },
    C: { total:2.20, pesoCasa:0.583 }, D: { total:2.65, pesoCasa:0.604 },
    CB:{ total:2.50, pesoCasa:0.652 },
  },
  mnMM: 1.35, // mata-mata neutro 180min (Série D + Final Copa)
  maxSpread: 5.0, // cap do expoente (evita distorção em ligas de range estreito)
  // Favoritismo dependente do Elo (modo Elo puro). on=false → c0 fixo 0.50 (comportamento
  // anterior). Quando on: c0 = cMax − (cMax−cMin)/(1+e^(−(|Δ|−mid)/steep)). Δ = gap de Elo
  // (com vantagem de casa). c0 menor = favoritismo mais forte. Calibrado nas seleções.
  c0Log: { on:false, cMax:0.50, cMin:0.10, mid:190, steep:70 },
};
const getML = (cfg,k) => { const l=cfg.lambdas[k]; return { mc:l.total*l.pesoCasa, mf:l.total*(1-l.pesoCasa) }; };
// Probabilidades V/E/D via Poisson
const boxMuller=()=>Math.sqrt(-2*Math.log(Math.random()))*Math.cos(2*Math.PI*Math.random());
// Aplica drift estocástico em Elo + atk/def (σ_ad = σ_elo × 0.008).
// A razão 0.008 (v4.8) substitui o 0.002 anterior que produzia efeito visível
// apenas no Elo. Derivação: para efeitos comparáveis em λ (gols esperados),
// σ_elo=15 acumulado em 30 rodadas produz ~82 pts de drift Elo (~1.4× em λ);
// com sAD=0.008, σ_ad_acum ≈ 0.66, clamped [0.3, 3] → impacto ~1.3× em λ.
// Valores menores davam impacto quase inerte em modo ATK/DEF.
const applyDrift=(times,el,at,df,sigmaElo)=>{const sAD=sigmaElo*0.008;times.forEach(t=>{el[t]+=sigmaElo*boxMuller();at[t]=Math.max(0.3,Math.min(3,at[t]+sAD*boxMuller()));df[t]=Math.max(0.3,Math.min(3,df[t]+sAD*boxMuller()));});};
const calcProbs = (lC,lF) => { let pH=0,pD=0,pA=0; for(let gc=0;gc<8;gc++) for(let gf=0;gf<8;gf++){const p=poissonProb(lC,gc)*poissonProb(lF,gf);if(gc>gf)pH+=p;else if(gc===gf)pD+=p;else pA+=p;} const t=pH+pD+pA; return{pH:pH/t*100,pD:pD/t*100,pA:pA/t*100}; };

// === ENGINE ===
const initLeague = (times, getElo, cfg) => {
  const elos=times.map(t=>getElo(t)); const mean=elos.reduce((s,e)=>s+e,0)/elos.length;
  const mx=Math.max(...elos),mn=Math.min(...elos);
  const rawSpread=(mx===mn)?1:Math.log(cfg.targetRatio)/Math.log(mx/mn);
  const spread=Math.min(rawSpread, cfg.maxSpread||5.0);
  const rA=times.map(t=>Math.pow(getElo(t)/mean,spread)),rD=times.map(t=>Math.pow(mean/getElo(t),spread));
  const aA=rA.reduce((s,v)=>s+v,0)/rA.length,aD=rD.reduce((s,v)=>s+v,0)/rD.length;
  return { mean,spread,aA,aD, initAD:(elo)=>({atk:Math.pow(elo/mean,spread)/aA,def:Math.pow(mean/elo,spread)/aD}) };
};
const calcL = (aC,dC,aF,dF,eC,eF,mc,mf,ha,eo,c0p) => {
  if(eo){const d=(eC+ha)-eF;const e=1/(1+Math.pow(10,-d/400));
    let c0=0.5;if(c0p&&c0p.on){c0=c0p.cMax-(c0p.cMax-c0p.cMin)/(1+Math.exp(-(Math.abs(d)-c0p.mid)/c0p.steep));}
    const c1=2*(1-c0);return{lC:mc*(c0+c1*e),lF:mf*(c0+c1*(1-e))};}
  return{lC:Math.max(0.2,Math.min(4.5,mc*aC*dF)),lF:Math.max(0.15,Math.min(4.0,mf*aF*dC))};
};
const updR = (elos,atk,def_,c,f,gc,gf,lC,lF,cfg,ak,eo) => {
  const ap=cfg.alphas[ak];const d=(elos[c]+cfg.homeAdv)-elos[f];const ex=1/(1+Math.pow(10,-d/400));
  const r=gc>gf?1:gc===gf?0.5:0;const mg=Math.log(Math.abs(gc-gf)+1);
  const dt=ap.kElo*(1+mg*0.5)*(r-ex);elos[c]+=dt;elos[f]-=dt;
  if(!eo){const sAC=lC>0.01?(gc-lC)/lC:0,sDC=lF>0.01?(gf-lF)/lF:0;
    atk[c]=Math.max(0.3,Math.min(3,atk[c]*(1+ap.atk*suavLog(sAC))));def_[c]=Math.max(0.3,Math.min(3,def_[c]*(1+ap.def*suavLog(sDC))));
    const sAF=lF>0.01?(gf-lF)/lF:0,sDF=lC>0.01?(gc-lC)/lC:0;
    atk[f]=Math.max(0.3,Math.min(3,atk[f]*(1+ap.atk*suavLog(sAF))));def_[f]=Math.max(0.3,Math.min(3,def_[f]*(1+ap.def*suavLog(sDF))));}
};
// Calcula Elo, atk, def *atuais* de cada time aplicando os resultados reais
// confirmados (sem simular). Usa updR de forma sequencial, ordenando por rodada.
// Retorna {elo:{t:val}, atk:{t:val}, def:{t:val}} com snapshot pós-rodadas reais.
// Esse helper é puro (sem efeitos colaterais) e pode ser chamado fora de qualquer sim.
// applyCB: se true, aplica os jogos da Copa do Brasil (CB_RES_IDA + CB_RES_VOLTA)
// onde algum dos times está em `times`. Times externos (de outras séries) usam
// CB_ELOS como fallback para o cálculo do gap esperado, mas só os times de `times`
// têm seus Elos/atk/def atualizados no retorno.
const computeCurrentAD=(times,getElo,res,cfg,sk,ak,applyCB)=>{
  const lg=initLeague(times,getElo,cfg);const{mc,mf}=getML(cfg,sk);
  const elos={},atk={},def={},atkIni={},defIni={};
  times.forEach(t=>{elos[t]=getElo(t);const i=lg.initAD(elos[t]);atk[t]=i.atk;def[t]=i.def;atkIni[t]=i.atk;defIni[t]=i.def;});
  const sorted=[...res].sort((a,b)=>(a.r||0)-(b.r||0));
  for(const r of sorted){
    if(elos[r.c]===undefined||elos[r.f]===undefined)continue;
    const{lC,lF}=calcL(atk[r.c],def[r.c],atk[r.f],def[r.f],elos[r.c],elos[r.f],mc,mf,cfg.homeAdv,false);
    updR(elos,atk,def,r.c,r.f,r.gc,r.gf,lC,lF,cfg,ak,false);
  }
  if(applyCB)applyCBToLeague(elos,atk,def,lg,cfg,ak,false);
  return{elo:elos,atk,def,atkIni,defIni};
};
// v4.37: backtest/calibração (#5). Walk-forward honesto: para cada jogo já disputado,
// prevê com os ratings treinados SÓ nos jogos anteriores (out-of-sample) e registra
// (previsão, resultado). Depois atualiza o estado e segue. Mede o quão calibradas são
// as probabilidades V/E/D do modelo — não basta apontar o favorito, os % têm que bater.
const backtestSeries=(times,getElo,res,cfg,sk,ak)=>{
  const lg=initLeague(times,getElo,cfg);const{mc,mf}=getML(cfg,sk);
  const elos={},atk={},def={};
  times.forEach(t=>{elos[t]=getElo(t);const i=lg.initAD(elos[t]);atk[t]=i.atk;def[t]=i.def;});
  const sorted=[...res].sort((a,b)=>(a.r||0)-(b.r||0));
  const preds=[];
  for(const r of sorted){
    if(elos[r.c]===undefined||elos[r.f]===undefined)continue;
    const{lC,lF}=calcL(atk[r.c],def[r.c],atk[r.f],def[r.f],elos[r.c],elos[r.f],mc,mf,cfg.homeAdv,false);
    const pr=calcProbs(lC,lF);
    const oH=r.gc>r.gf?1:0,oD=r.gc===r.gf?1:0,oA=r.gc<r.gf?1:0;
    preds.push({pH:pr.pH/100,pD:pr.pD/100,pA:pr.pA/100,oH,oD,oA});
    updR(elos,atk,def,r.c,r.f,r.gc,r.gf,lC,lF,cfg,ak,false);
  }
  return preds;
};
const brierOf=(p)=>Math.pow(p.pH-p.oH,2)+Math.pow(p.pD-p.oD,2)+Math.pow(p.pA-p.oA,2);
const metricsOf=(preds)=>{
  const n=preds.length;
  if(!n)return{n:0,brier:0,brierUnif:0,brierBase:0,logloss:0,loglossUnif:Math.log(3),acc:0,homeRate:0};
  let oH=0,oD=0,oA=0;preds.forEach(p=>{oH+=p.oH;oD+=p.oD;oA+=p.oA;});
  const bH=oH/n,bD=oD/n,bA=oA/n,u=1/3;
  let brier=0,brierUnif=0,brierBase=0,logloss=0,accFav=0;
  preds.forEach(p=>{
    brier+=brierOf(p);
    brierUnif+=Math.pow(u-p.oH,2)+Math.pow(u-p.oD,2)+Math.pow(u-p.oA,2);
    brierBase+=Math.pow(bH-p.oH,2)+Math.pow(bD-p.oD,2)+Math.pow(bA-p.oA,2);
    const po=p.oH?p.pH:(p.oD?p.pD:p.pA);logloss+=-Math.log(Math.max(1e-9,po));
    const fav=(p.pH>=p.pD&&p.pH>=p.pA)?'H':(p.pD>=p.pA?'D':'A');
    const out=p.oH?'H':(p.oD?'D':'A');if(fav===out)accFav++;
  });
  return{n,brier:brier/n,brierUnif:brierUnif/n,brierBase:brierBase/n,logloss:logloss/n,loglossUnif:Math.log(3),acc:accFav/n,homeRate:bH};
};
const runBacktest=(cfg)=>{
  const ak=cfg.defaultAlpha;
  const SER={
    A:{times:Object.keys(SA_RANKING),ge:t=>SA_RANKING[t].elo,res:SA_RES,sk:'A'},
    B:{times:Object.keys(SB_RANKING),ge:t=>SB_RANKING[t].elo,res:SB_RES,sk:'B'},
    C:{times:Object.keys(SC_RANKING),ge:t=>SC_RANKING[t].elo,res:SC_RES,sk:'C'},
    D:{times:SD_TIMES,ge:t=>SD_INFO[t].elo,res:SD_RES,sk:'D'},
  };
  const per={};let all=[];
  for(const s of ['A','B','C','D']){const p=backtestSeries(SER[s].times,SER[s].ge,SER[s].res,cfg,SER[s].sk,ak);per[s]=metricsOf(p);per[s].preds=p.length;all=all.concat(p);}
  const bins=Array.from({length:10},(_,i)=>({lo:i*10,hi:(i+1)*10,sumP:0,sumO:0,n:0}));
  all.forEach(p=>{[['pH','oH'],['pD','oD'],['pA','oA']].forEach(([pk,ok])=>{const prob=p[pk];const bi=Math.min(9,Math.floor(prob*10));bins[bi].sumP+=prob;bins[bi].sumO+=p[ok];bins[bi].n++;});});
  return{global:metricsOf(all),per,bins};
};
// Aplica os jogos confirmados da Copa do Brasil (R32 ida/volta) aos Elos/atk/def
// de uma liga. Para cada par CB_R32, se ida e/ou volta tem placar real, aplica updR.
// Times "externos" (não presentes em el2) usam CB_ELOS + initAD como fallback para o
// cálculo do gap, mas NÃO são modificados — apenas times da liga (presentes em el2)
// têm seus ratings atualizados. Mutates el2/at2/df2 in-place.
const applyCBToLeague=(el2,at2,df2,lg,cfg,ak,eo)=>{
  const{mc:cm,mf:cf}=getML(cfg,'CB');
  const apply=(mandante,visitante,gM,gV)=>{
    const inM=el2[mandante]!==undefined,inV=el2[visitante]!==undefined;
    if(!inM&&!inV)return;
    const eM=inM?el2[mandante]:(CB_ELOS[mandante]||1200);
    const eV=inV?el2[visitante]:(CB_ELOS[visitante]||1200);
    const aM=inM?at2[mandante]:lg.initAD(eM).atk;
    const aV=inV?at2[visitante]:lg.initAD(eV).atk;
    const dM=inM?df2[mandante]:lg.initAD(eM).def;
    const dV=inV?df2[visitante]:lg.initAD(eV).def;
    const{lC,lF}=calcL(aM,dM,aV,dV,eM,eV,cm,cf,cfg.homeAdv,eo,cfg.c0Log);
    const elsT={[mandante]:eM,[visitante]:eV};
    const atkT={[mandante]:aM,[visitante]:aV};
    const defT={[mandante]:dM,[visitante]:dV};
    updR(elsT,atkT,defT,mandante,visitante,gM,gV,lC,lF,cfg,ak,eo);
    if(inM){el2[mandante]=elsT[mandante];at2[mandante]=atkT[mandante];df2[mandante]=defT[mandante];}
    if(inV){el2[visitante]=elsT[visitante];at2[visitante]=atkT[visitante];df2[visitante]=defT[visitante];}
  };
  CB_R32.forEach(([ia,ib],idx)=>{
    const a=CB_TEAMS[ia],b=CB_TEAMS[ib];
    const ida=CB_RES_IDA[idx],volta=CB_RES_VOLTA[idx];
    if(ida)apply(a,b,ida.ga,ida.gb);
    if(volta)apply(b,a,volta.ga,volta.gb); // mando inverte na volta
  });
};
// computeUnifiedState: estado global Elo/atk/def de TODOS os times (A+B+C+D)
// após aplicar cronologicamente todos os resultados reais (SA_RES, SB_RES, SC_RES,
// SD_RES, CB_RES_IDA, CB_RES_VOLTA). Cada série é processada com seus próprios
// lambdas (mc/mf via getML). Usado por allElos/allTeams no App e pela aba Ratings
// da Copa BR para mostrar valores atuais (não nominais pré-temporada).
const computeUnifiedState=(cfg,ak)=>{
  const elos={},atk={},def={};
  const lgCache={};
  const initFor=(teams,getElo,sk)=>{
    const lg=initLeague(teams,getElo,cfg);lgCache[sk]=lg;
    teams.forEach(t=>{elos[t]=getElo(t);const i=lg.initAD(elos[t]);atk[t]=i.atk;def[t]=i.def;});
  };
  initFor(Object.keys(SA_RANKING),t=>SA_RANKING[t].elo,'A');
  initFor(Object.keys(SB_RANKING),t=>SB_RANKING[t].elo,'B');
  initFor(Object.keys(SC_RANKING),t=>SC_RANKING[t].elo,'C');
  initFor(SD_TIMES,t=>SD_INFO[t].elo,'D');
  const apply=(results,sk)=>{const{mc,mf}=getML(cfg,sk);
    for(const r of results){if(elos[r.c]===undefined||elos[r.f]===undefined)continue;
      const{lC,lF}=calcL(atk[r.c],def[r.c],atk[r.f],def[r.f],elos[r.c],elos[r.f],mc,mf,cfg.homeAdv,false);
      updR(elos,atk,def,r.c,r.f,r.gc,r.gf,lC,lF,cfg,ak,false);
    }
  };
  apply(SA_RES,'A');apply(SB_RES,'B');apply(SC_RES,'C');apply(SD_RES,'D');
  // Apply CB results — usa lgCache.A como fallback p/ teams externos (caso de mismatch
  // de nome como "Barra-SC" vs "Barra"; vasta maioria dos teams CB já estão no state)
  applyCBToLeague(elos,atk,def,lgCache.A,cfg,ak,false);
  return{elos,atk,def};
};
const calcClassif = (times,res) => { const s={};times.forEach(t=>{s[t]={P:0,J:0,V:0,E:0,D:0,GP:0,GC:0};});
  res.forEach(r=>{if(!s[r.c]||!s[r.f])return;s[r.c].J++;s[r.f].J++;s[r.c].GP+=r.gc;s[r.c].GC+=r.gf;s[r.f].GP+=r.gf;s[r.f].GC+=r.gc;
    if(r.gc>r.gf){s[r.c].V++;s[r.c].P+=3;s[r.f].D++;}else if(r.gc===r.gf){s[r.c].E++;s[r.f].E++;s[r.c].P++;s[r.f].P++;}else{s[r.f].V++;s[r.f].P+=3;s[r.c].D++;}});
  return times.map(t=>({time:t,...s[t],SG:s[t].GP-s[t].GC})).sort((a,b)=>b.P-a.P||b.V-a.V||b.SG-a.SG||b.GP-a.GP).map((c,i)=>({...c,pos:i+1}));
};
const simMC = (times,ranking,tab,res,cfg,sk,nS,ak,eo) => {
  const lg=initLeague(times,t=>ranking[t].elo,cfg);const{mc,mf}=getML(cfg,sk);
  const ct={},pts={},posF={},elFinal={},atFinal={},dfFinal={};
  const extraStats=(sk==='C'||sk==='B')?{}:null;
  const ptsAtPos=Array.from({length:times.length},()=>[]);
  // atk/def iniciais (base, antes do Elo evoluir nas rodadas reais): calculados
  // pelo lg.initAD(elo) — mesma função usada internamente em cada sim.
  const initAD={};times.forEach(t=>{initAD[t]=lg.initAD(ranking[t].elo);});
  times.forEach(t=>{ct[t]={t:0,g4:0,z4:0};pts[t]=[];posF[t]=new Array(times.length).fill(0);elFinal[t]=[];atFinal[t]=[];dfFinal[t]=[];if(extraStats){if(sk==='C')extraStats[t]={q4:0,qChamp:0,matchups:{quad:{},camp:{}}};else if(sk==='B')extraStats[t]={bPlayoff:0,bAccess:0,matchups:{po:{}}};}});
  for(let sim=0;sim<nS;sim++){simMC_single(times,ranking,tab,res,cfg,sk,ak,eo,lg,mc,mf,ct,pts,posF,ptsAtPos,elFinal,extraStats,atFinal,dfFinal);}
  return simMC_finalize(times,ct,pts,posF,ptsAtPos,nS,elFinal,extraStats,atFinal,dfFinal,ranking,initAD,sk==='C'?2:4);
};

// Corpo de 1 simulação do simMC. Extraído para reuso na versão async.
const simMC_single=(times,ranking,tab,res,cfg,sk,ak,eo,lg,mc,mf,ct,pts,posF,ptsAtPos,elFinal,extraStats,atFinal,dfFinal,initialAD)=>{
  const st={},el={},at={},df={};
  times.forEach(t=>{st[t]={P:0,J:0,V:0,E:0,D:0,GP:0,GC:0};if(initialAD){el[t]=initialAD.el[t];at[t]=initialAD.at[t];df[t]=initialAD.df[t];}else{el[t]=ranking[t].elo;const i=lg.initAD(ranking[t].elo);at[t]=i.atk;df[t]=i.def;}});
  let lastDR=0;const maxRR=Math.max(0,...res.map(r=>r.r));
  for(const j of tab){const{casa:c,fora:f,rodada:rd}=j;if(!st[c]||!st[f])continue;if(rd>lastDR&&rd>maxRR&&cfg.drift>0){lastDR=rd;applyDrift(times,el,at,df,cfg.drift);}
    const real=res.find(r=>r.c===c&&r.f===f&&(r.r===rd||r.r===0));let gc,gf;
    if(real){gc=real.gc;gf=real.gf;}else{const{lC,lF}=calcL(at[c],df[c],at[f],df[f],el[c],el[f],mc,mf,cfg.homeAdv,eo,cfg.c0Log);gc=poissonRandom(lC);gf=poissonRandom(lF);}
    st[c].J++;st[f].J++;st[c].GP+=gc;st[c].GC+=gf;st[f].GP+=gf;st[f].GC+=gc;
    if(gc>gf){st[c].V++;st[c].P+=3;st[f].D++;}else if(gc===gf){st[c].E++;st[f].E++;st[c].P++;st[f].P++;}else{st[f].V++;st[f].P+=3;st[c].D++;}
    if(real){const{lC,lF}=calcL(at[c],df[c],at[f],df[f],el[c],el[f],mc,mf,cfg.homeAdv,eo,cfg.c0Log);updR(el,at,df,c,f,gc,gf,lC,lF,cfg,ak,eo);}}
  const cl=times.map(t=>({time:t,...st[t],SG:st[t].GP-st[t].GC})).sort((a,b)=>b.P-a.P||b.V-a.V||b.SG-a.SG||b.GP-a.GP);
  // Usa zona g4 real da série:
  //   Série A: top-4 (Libertadores)
  //   Série B: top-2 (acesso direto; 3º-6º disputam playoff — simulado abaixo)
  //   Série C: top-8 (quadrangular — simulado abaixo)
  //   Série D: top-4 dentro do grupo (simulação dedicada simMC_D)
  const g4cut=sk==='C'?8:sk==='B'?2:4;
  cl.forEach((c,i)=>{pts[c.time].push(c.P);posF[c.time][i]++;ptsAtPos[i].push(c.P);
    if(i===0)ct[c.time].t++;if(i<g4cut)ct[c.time].g4++;const nReb=sk==='C'?2:4;if(i>=times.length-nReb)ct[c.time].z4++;});
  // Acumula Elo final por time (amostra no fim da temporada simulada).
  if(elFinal){times.forEach(t=>{elFinal[t].push(el[t]);if(atFinal)atFinal[t].push(at[t]);if(dfFinal)dfFinal[t].push(df[t]);});}
  // Série B: simula playoff de acesso (regulamento 2026+).
  // Regulamento CBF 2026: 1º e 2º sobem direto; 3º×6º e 4º×5º disputam ida-volta,
  // 2 vencedores sobem (total 4 acessos). Campo bAccess = acesso real à Série A.
  // extraStats[t].bPlayoff = participou do playoff (top 3-6)
  // extraStats[t].bAccess  = conseguiu acesso (top-2 OR venceu playoff)
  if(sk==='B'&&extraStats){
    const top6=cl.slice(0,6).map(c=>c.time);
    const top2=top6.slice(0,2);const playoff=top6.slice(2,6);// [3º,4º,5º,6º]
    top2.forEach(t=>extraStats[t].bAccess++);
    playoff.forEach(t=>extraStats[t].bPlayoff++);
    // Registra cruzamentos do playoff: 3º × 6º e 4º × 5º.
    // matchups[t].po = {adversario: count}
    const p0=playoff[0],p3=playoff[3],p1=playoff[1],p2=playoff[2];
    if(extraStats[p0].matchups){extraStats[p0].matchups.po[p3]=(extraStats[p0].matchups.po[p3]||0)+1;extraStats[p3].matchups.po[p0]=(extraStats[p3].matchups.po[p0]||0)+1;}
    if(extraStats[p1].matchups){extraStats[p1].matchups.po[p2]=(extraStats[p1].matchups.po[p2]||0)+1;extraStats[p2].matchups.po[p1]=(extraStats[p2].matchups.po[p1]||0)+1;}
    // Confrontos: 3º vs 6º, 4º vs 5º — ida (mandante inverso: 6º/5º em casa), volta (3º/4º).
    // Agregado de gols sobre 180 min; empate → pênaltis (50/50 aqui, simplificação razoável).
    const ttest=(a,b)=>{
      const{lC:lc1,lF:lf1}=calcL(at[b],df[b],at[a],df[a],el[b],el[a],mc,mf,cfg.homeAdv,eo,cfg.c0Log);
      const{lC:lc2,lF:lf2}=calcL(at[a],df[a],at[b],df[b],el[a],el[b],mc,mf,cfg.homeAdv,eo,cfg.c0Log);
      const g1a=poissonRandom(lc1),g1b=poissonRandom(lf1);// ida: b vs a
      const g2a=poissonRandom(lc2),g2b=poissonRandom(lf2);// volta: a vs b
      const aggA=g1b+g2a,aggB=g1a+g2b;
      if(aggA!==aggB)return aggA>aggB?a:b;
      return Math.random()<0.5?a:b;// pênaltis
    };
    const w1=ttest(playoff[0],playoff[3]);// 3º×6º
    const w2=ttest(playoff[1],playoff[2]);// 4º×5º
    extraStats[w1].bAccess++;extraStats[w2].bAccess++;
  }
  // Série C: simula quadrangular final (G8→top-4 sobem).
  // Regulamento: 2 grupos de 4 times sorteados pela colocação (1º, 4º, 5º, 8º em
  // grupo A; 2º, 3º, 6º, 7º em grupo B), todos contra todos ida-volta, 2 de cada
  // grupo acessam à Série B. Probabilidade "acesso" (q4) = chegar no top-2 de seu
  // grupo no quadrangular.
  if(sk==='C'&&extraStats){
    const top8=cl.slice(0,8).map(c=>c.time);
    const gA=[top8[0],top8[3],top8[4],top8[7]];const gB=[top8[1],top8[2],top8[5],top8[6]];
    // Registra adversários da fase quadrangular (3 por time no grupo).
    const regQuad=(grupo)=>{for(let i=0;i<4;i++)for(let j=0;j<4;j++)if(i!==j&&extraStats[grupo[i]].matchups){extraStats[grupo[i]].matchups.quad[grupo[j]]=(extraStats[grupo[i]].matchups.quad[grupo[j]]||0)+1;}};
    regQuad(gA);regQuad(gB);
    // Quadrangular: 4 times × todos-contra-todos ida-volta = 12 jogos por grupo
    // (6 duplas × 2). O loop i,j com i!==j já gera os 12 (cada par como mandante
    // uma vez). Regulamento CBF 2026: 6 rodadas, turno e returno.
    const quadGroupSim=(grupo)=>{
      const qst={};grupo.forEach(t=>{qst[t]={P:0,V:0,E:0,D:0,GP:0,GC:0};});
      for(let i=0;i<4;i++)for(let j=0;j<4;j++){if(i===j)continue;const c=grupo[i],f=grupo[j];
        const{lC,lF}=calcL(at[c],df[c],at[f],df[f],el[c],el[f],mc,mf,cfg.homeAdv,eo,cfg.c0Log);
        const gc=poissonRandom(lC),gf=poissonRandom(lF);
        qst[c].GP+=gc;qst[c].GC+=gf;qst[f].GP+=gf;qst[f].GC+=gc;
        if(gc>gf){qst[c].V++;qst[c].P+=3;qst[f].D++;}else if(gc===gf){qst[c].E++;qst[f].E++;qst[c].P++;qst[f].P++;}else{qst[f].V++;qst[f].P+=3;qst[c].D++;}}
      return grupo.map(t=>({time:t,...qst[t],SG:qst[t].GP-qst[t].GC})).sort((a,b)=>b.P-a.P||b.V-a.V||b.SG-a.SG||b.GP-a.GP);
    };
    const resA=quadGroupSim(gA),resB=quadGroupSim(gB);
    // Top-2 de cada grupo acessam; 1º de cada grupo joga a final (título Série C)
    [resA[0],resA[1],resB[0],resB[1]].forEach(r=>extraStats[r.time].q4++);
    // Final Série C: 1º A × 1º B em ida e volta, agregado de gols, empate → pênaltis.
    // Mandante da volta = melhor campanha (aproximação: melhor pontuação na fase
    // de grupos do quadrangular; usamos P como tiebreaker).
    const fa=resA[0].time,fb=resB[0].time;
    if(extraStats[fa].matchups){extraStats[fa].matchups.camp[fb]=(extraStats[fa].matchups.camp[fb]||0)+1;extraStats[fb].matchups.camp[fa]=(extraStats[fb].matchups.camp[fa]||0)+1;}
    // Define mandante da volta por P (pts no quadrangular); empate → fa (1ºA arbitrário)
    const paS=resA[0].P,pbS=resB[0].P;
    const voltaMandante=paS>=pbS?fa:fb;
    const idaMandante=voltaMandante===fa?fb:fa;
    // Ida (idaMandante em casa)
    const{lC:il1,lF:il2}=calcL(at[idaMandante],df[idaMandante],at[voltaMandante],df[voltaMandante],el[idaMandante],el[voltaMandante],mc,mf,cfg.homeAdv,eo,cfg.c0Log);
    const ig1=poissonRandom(il1),ig2=poissonRandom(il2);
    // Volta (voltaMandante em casa)
    const{lC:vl1,lF:vl2}=calcL(at[voltaMandante],df[voltaMandante],at[idaMandante],df[idaMandante],el[voltaMandante],el[idaMandante],mc,mf,cfg.homeAdv,eo,cfg.c0Log);
    const vg1=poissonRandom(vl1),vg2=poissonRandom(vl2);
    // Agregado
    const aggVM=ig2+vg1;// voltaMandante total
    const aggIM=ig1+vg2;// idaMandante total
    let camp;
    if(aggVM>aggIM)camp=voltaMandante;
    else if(aggIM>aggVM)camp=idaMandante;
    else camp=Math.random()<0.5?voltaMandante:idaMandante;// pênaltis
    extraStats[camp].qChamp++;
  }
};

const simMC_finalize=(times,ct,pts,posF,ptsAtPos,nS,elFinal,extraStats,atFinal,dfFinal,ranking,initAD,nReb)=>{
  const pctl=(arr,q)=>{if(!arr.length)return 0;const s=[...arr].sort((a,b)=>a-b);return s[Math.floor(s.length*q)]||0;};
  const pc=(pos)=>({p10:pctl(ptsAtPos[pos],0.1),p50:pctl(ptsAtPos[pos],0.5),p90:pctl(ptsAtPos[pos],0.9)});
  // Converte mapas {adversario: count} em arrays [{adv, pct, count}] ordenados desc.
  const normPhase=(m)=>{const total=Object.values(m).reduce((s,v)=>s+v,0);return Object.entries(m).map(([adv,c])=>({adv,pct:total>0?c/total*100:0,count:c})).sort((a,b)=>b.pct-a.pct);};
  const avg=(arr)=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;
  return{probs:times.map(t=>{
    const o={time:t,titulo:ct[t].t/nS*100,g4:ct[t].g4/nS*100,z4:ct[t].z4/nS*100,mediaPts:pts[t].reduce((s,p)=>s+p,0)/nS,medianPts:pctl(pts[t],0.5),p10Pts:pctl(pts[t],0.1),p90Pts:pctl(pts[t],0.9),posF:posF[t].map(v=>v/nS*100),ptsSamples:pts[t]};
    if(elFinal){o.eloFinal=Math.round(avg(elFinal[t]));}
    // atk/def: iniciais = initAD (calculado via lg.initAD do Elo nominal do ranking);
    // finais = média sobre N simulações (captura evolução das rodadas reais + drift).
    if(initAD&&initAD[t]){o.atk=initAD[t].atk;o.def=initAD[t].def;}
    if(atFinal&&atFinal[t])o.atkFinal=avg(atFinal[t]);
    if(dfFinal&&dfFinal[t])o.defFinal=avg(dfFinal[t]);
    if(extraStats&&extraStats[t]){
      if(extraStats[t].q4!==undefined){o.q4=extraStats[t].q4/nS*100;o.qChamp=extraStats[t].qChamp/nS*100;}
      if(extraStats[t].bAccess!==undefined){o.bPlayoff=extraStats[t].bPlayoff/nS*100;o.bAccess=extraStats[t].bAccess/nS*100;}
      if(extraStats[t].matchups){
        o.matchups={};
        for(const fase in extraStats[t].matchups)o.matchups[fase]=normPhase(extraStats[t].matchups[fase]);
      }
    }
    return o;
  }).sort((a,b)=>b.mediaPts-a.mediaPts),nSims:nS,
    cortes:{titulo:pc(0),g4:pc(3),meio:pc(Math.floor(times.length/2)),z4:pc(times.length-(nReb||4)),ultimo:pc(times.length-1)}};
};

// Roda simMC em chunks via requestAnimationFrame, reportando progresso 0-1.
// onProgress(completed, total) chamado ~a cada frame. onDone(result) ao final.
// IMPORTANTE: aplica os jogos confirmados da Copa do Brasil ao estado inicial
// via applyCBToLeague — isso garante que efeitos de CB (vitórias/derrotas em mata-mata)
// se propaguem para o Elo/atk/def usados nas simulações de A/B/C também. Match
// chronological order: CB ida (Apr 21-23) ocorre no meio da temporada, mas para
// simplicidade aplicamos no estado inicial — o impacto na ordem é pequeno (Elo
// dynamics são aproximadamente comutativas para shifts pequenos).
const simMC_async=(times,ranking,tab,res,cfg,sk,nS,ak,eo,onProgress,onDone)=>{
  const lg=initLeague(times,t=>ranking[t].elo,cfg);const{mc,mf}=getML(cfg,sk);
  const ct={},pts={},posF={},elFinal={},atFinal={},dfFinal={};
  const extraStats=(sk==='C'||sk==='B')?{}:null;
  const ptsAtPos=Array.from({length:times.length},()=>[]);
  const initAD={};times.forEach(t=>{initAD[t]=lg.initAD(ranking[t].elo);});
  // Estado inicial unificado (Elos + atk/def) com CB aplicado — usado em cada sim
  // para refletir efeitos cruzados entre A/B/C/D e Copa do Brasil.
  const initialAD={el:{},at:{},df:{}};
  times.forEach(t=>{initialAD.el[t]=ranking[t].elo;initialAD.at[t]=initAD[t].atk;initialAD.df[t]=initAD[t].def;});
  applyCBToLeague(initialAD.el,initialAD.at,initialAD.df,lg,cfg,ak,eo);
  times.forEach(t=>{ct[t]={t:0,g4:0,z4:0};pts[t]=[];posF[t]=new Array(times.length).fill(0);elFinal[t]=[];atFinal[t]=[];dfFinal[t]=[];if(extraStats){if(sk==='C')extraStats[t]={q4:0,qChamp:0,matchups:{quad:{},camp:{}}};else if(sk==='B')extraStats[t]={bPlayoff:0,bAccess:0,matchups:{po:{}}};}});
  const chunk=Math.max(20,Math.floor(nS/40));let done=0;
  const run=()=>{
    const end=Math.min(done+chunk,nS);
    for(;done<end;done++)simMC_single(times,ranking,tab,res,cfg,sk,ak,eo,lg,mc,mf,ct,pts,posF,ptsAtPos,elFinal,extraStats,atFinal,dfFinal,initialAD);
    onProgress(done,nS);
    if(done<nS)requestAnimationFrame(run);
    else onDone(simMC_finalize(times,ct,pts,posF,ptsAtPos,nS,elFinal,extraStats,atFinal,dfFinal,ranking,initAD,sk==='C'?2:4));
  };
  requestAnimationFrame(run);
};
const simUnica = (times,ranking,tab,res,cfg,sk,ak,eo) => {
  const lg=initLeague(times,t=>ranking[t].elo,cfg);const{mc,mf}=getML(cfg,sk);
  const st={},el={},at={},df={};times.forEach(t=>{st[t]={P:0,J:0,V:0,E:0,D:0,GP:0,GC:0};el[t]=ranking[t].elo;const i=lg.initAD(ranking[t].elo);at[t]=i.atk;df[t]=i.def;});
  const jogos=[];
  let lastDR=0;const maxRR=Math.max(0,...res.map(r=>r.r));for(const j of tab){const{casa:c,fora:f,rodada:rd}=j;if(!st[c]||!st[f])continue;if(rd>lastDR&&rd>maxRR&&cfg.drift>0){lastDR=rd;applyDrift(times,el,at,df,cfg.drift);}
    const real=res.find(r=>r.c===c&&r.f===f&&(r.r===rd||r.r===0));let gc,gf;
    if(real){gc=real.gc;gf=real.gf;}else{const{lC,lF}=calcL(at[c],df[c],at[f],df[f],el[c],el[f],mc,mf,cfg.homeAdv,eo,cfg.c0Log);gc=poissonRandom(lC);gf=poissonRandom(lF);}
    jogos.push({casa:c,fora:f,gc,gf,rodada:rd,real:!!real,data:j.data||''});
    st[c].J++;st[f].J++;st[c].GP+=gc;st[c].GC+=gf;st[f].GP+=gf;st[f].GC+=gc;
    if(gc>gf){st[c].V++;st[c].P+=3;st[f].D++;}else if(gc===gf){st[c].E++;st[f].E++;st[c].P++;st[f].P++;}else{st[f].V++;st[f].P+=3;st[c].D++;}
    const{lC,lF}=calcL(at[c],df[c],at[f],df[f],el[c],el[f],mc,mf,cfg.homeAdv,eo,cfg.c0Log);if(real)updR(el,at,df,c,f,gc,gf,lC,lF,cfg,ak,eo);}
  return{classificacao:times.map(t=>({time:t,...st[t],SG:st[t].GP-st[t].GC})).sort((a,b)=>b.P-a.P||b.V-a.V||b.SG-a.SG||b.GP-a.GP).map((c,i)=>({...c,pos:i+1})),jogos};
};

// === MC SÉRIE D (para Simular Tudo) ===
// Helpers da Série D:
//   pairKey: identifica um par de times em determinado turno (1-5 ou 6-10),
//            independente de quem é mandante/visitante. Isso torna o casamento
//            com SD_RES robusto a diferenças entre a tabela oficial da CBF e a
//            gerada algoritmicamente por genGrpTab.
//   prepareSerieDState: processa SD_RES uma única vez aplicando updR e gerando
//            o snapshot {el, at, df, st, jogados, maxRR, lg}. Cacheável.
//   cloneSDState: clona o snapshot para cada simulação sem reprocessar SD_RES.
const pairKey=(a,b,r)=>[a,b].sort().join('|')+'|'+(r<=5?1:2);
const cloneSDState=(snap)=>{const el={...snap.el},at={...snap.at},df={...snap.df},st={};for(const t in snap.st)st[t]={...snap.st[t]};return{el,at,df,st};};
const prepareSerieDState=(cfg,eo,ak,extra)=>{
  const lg=initLeague(SD_TIMES,t=>SD_INFO[t].elo,cfg);const{mc,mf}=getML(cfg,'D');
  const el={},at={},df={},atI={},dfI={},st={},jogados=new Set();
  SD_TIMES.forEach(t=>{el[t]=SD_INFO[t].elo;const i=lg.initAD(SD_INFO[t].elo);at[t]=i.atk;df[t]=i.def;atI[t]=i.atk;dfI[t]=i.def;st[t]={P:0,J:0,V:0,E:0,D:0,GP:0,GC:0};});
  let RES=SD_RES;
  if(extra&&extra.length){const seen=new Set(SD_RES.map(r=>r.c+'|'+r.f));RES=[...SD_RES,...extra.filter(r=>!seen.has(r.c+'|'+r.f))];}
  for(const r of RES){const c=r.c,f=r.f;if(!st[c]||!st[f])continue;
    const{lC,lF}=calcL(at[c],df[c],at[f],df[f],el[c],el[f],mc,mf,cfg.homeAdv,eo,cfg.c0Log);
    st[c].J++;st[f].J++;st[c].GP+=r.gc;st[c].GC+=r.gf;st[f].GP+=r.gf;st[f].GC+=r.gc;
    if(r.gc>r.gf){st[c].V++;st[c].P+=3;st[f].D++;}else if(r.gc===r.gf){st[c].E++;st[f].E++;st[c].P++;st[f].P++;}else{st[f].V++;st[f].P+=3;st[c].D++;}
    updR(el,at,df,c,f,r.gc,r.gf,lC,lF,cfg,ak,eo);
    jogados.add(pairKey(c,f,r.r));}
  // Aplica jogos da Copa do Brasil onde algum time da Série D participou (ex: Jacuipense, Barra-SC)
  applyCBToLeague(el,at,df,lg,cfg,ak,eo);
  const maxRR=Math.max(0,...RES.map(r=>r.r));
  return{el,at,df,atI,dfI,st,jogados,maxRR,lg};
};
// Corpo de 1 simulação completa da Série D (grupos + mata-mata).
// Recebe snap, tabD, ct (acumuladores); muta ct.
// ct[t] deve ter: {cl, grupoTop1, f2, f3, oit, qf, sf, fin, ac, ch, elFinalSum}
const simMC_D_single=(cfg,ak,eo,snap,tabD,ct,mc,mf,gpts)=>{
  const{el,at,df,st}=cloneSDState(snap);
  let lastDR=0;for(const j of tabD){if(snap.jogados.has(pairKey(j.casa,j.fora,j.rodada)))continue;
    if(j.rodada>lastDR&&j.rodada>snap.maxRR&&cfg.drift>0){lastDR=j.rodada;applyDrift(SD_TIMES,el,at,df,cfg.drift);}
    const{lC,lF}=calcL(at[j.casa],df[j.casa],at[j.fora],df[j.fora],el[j.casa],el[j.fora],mc,mf,cfg.homeAdv,eo,cfg.c0Log);
    const gc=poissonRandom(lC),gf=poissonRandom(lF);
    st[j.casa].J++;st[j.fora].J++;st[j.casa].GP+=gc;st[j.casa].GC+=gf;st[j.fora].GP+=gf;st[j.fora].GC+=gc;
    if(gc>gf){st[j.casa].V++;st[j.casa].P+=3;st[j.fora].D++;}else if(gc===gf){st[j.casa].E++;st[j.fora].E++;st[j.casa].P++;st[j.fora].P++;}else{st[j.fora].V++;st[j.fora].P+=3;st[j.casa].D++;}
    updR(el,at,df,j.casa,j.fora,gc,gf,lC,lF,cfg,ak,eo);}
  // Elo final acumulado para todos (usado p/ calcular média ao fim).
  // Também acumula pontos finais da fase de grupos para histograma por grupo
  // e soma atk/def finais (para mostrar médias atk/def finais).
  SD_TIMES.forEach(t=>{ct[t].elFinalSum+=el[t];ct[t].atSum+=at[t];ct[t].dfSum+=df[t];if(ct[t].ptsSamples)ct[t].ptsSamples.push(st[t].P);});
  // Classificação completa do grupo (1º ao 6º). Top-4 avançam (cl), top-1 = grupoTop1.
  // posGr[i] acumula quantas vezes o time terminou na (i+1)ª posição do seu grupo.
  // gpts[gIdx][pos] acumula a pontuação do time na (pos+1)ª posição (pos 0-3 = 1º-4º).
  const gruposRanked=SD_GRUPOS.map(g=>g.map(t=>({time:t,...st[t],SG:st[t].GP-st[t].GC})).sort((a,b)=>b.P-a.P||b.V-a.V||b.SG-a.SG||b.GP-a.GP));
  // SEMÂNTICA DAS CHAVES (refator v4.24): cada métrica significa "CHEGOU a essa fase".
  //   f2  = top-4 do grupo (chegou à 2ª fase) — 64 times/sim
  //   f3  = venceu 2ª fase (chegou à 3ª fase) — 32 times/sim
  //   oit = venceu 3ª fase (chegou às oitavas) — 16 times/sim
  //   qf  = venceu oitavas (chegou às quartas) — 8 times/sim
  //   sf  = venceu quartas (chegou à semi)    — 4 times/sim
  //   fin = venceu semi (chegou à final)       — 2 times/sim
  //   ch  = venceu final (campeão)             — 1 time/sim
  // Antes da v4.24 cada chave significava "VENCEU essa fase" (deslocada uma posição).
  gruposRanked.forEach((g,gIdx)=>{g.forEach((row,pos)=>{ct[row.time].posGr[pos]++;if(pos<4)ct[row.time].f2++;if(pos===0)ct[row.time].grupoTop1++;if(pos<4&&gpts)gpts[gIdx][pos].push(row.P);});});
  const gruposTop4=gruposRanked.map(g=>g.slice(0,4).map(c2=>c2.time));
  // Helper: registra cruzamento em matchups. ct[t].matchups[fase] = {adv: count}.
  const bumpMu=(t,fase,adv)=>{if(!ct[t].matchups)return;const m=ct[t].matchups;if(!m[fase])m[fase]={};m[fase][adv]=(m[fase][adv]||0)+1;};
  const s180=(a,b)=>{const r2=eo?(()=>{const d=el[a]-el[b];const e=1/(1+Math.pow(10,-d/400));return{lC:2*cfg.mnMM*(0.5+e),lF:2*cfg.mnMM*(0.5+(1-e))};})():{lC:Math.max(0.2,2*cfg.mnMM*at[a]*df[b]),lF:Math.max(0.2,2*cfg.mnMM*at[b]*df[a])};const ga=poissonRandom(r2.lC),gb=poissonRandom(r2.lF);return ga>gb?a:gb>ga?b:Math.random()<0.5?a:b;};
  // === 2ª fase (64 → 32): cruzamento entre grupos pareados ===
  // winF2: vencedores da 2ª fase (= os que CHEGAM à 3ª fase, contados em ct.f3).
  let winF2=[];
  for(const[gx,gy]of SD_PAIRS){
    const pairs=[[gruposTop4[gx][0],gruposTop4[gy][3]],[gruposTop4[gx][1],gruposTop4[gy][2]],[gruposTop4[gy][0],gruposTop4[gx][3]],[gruposTop4[gy][1],gruposTop4[gx][2]]];
    for(const[a,b]of pairs){bumpMu(a,'f2',b);bumpMu(b,'f2',a);winF2.push(s180(a,b));}
  }
  winF2.forEach(t=>ct[t].f3++);
  // === 3ª fase (32 → 16): cruzamento super-grupos ===
  // winF3: vencedores da 3ª fase (= os que CHEGAM às oitavas, contados em ct.oit).
  let winF3=[];
  for(const[p1,p2]of SD_SUPER){
    for(let j=0;j<4;j++){const a=winF2[p1*4+j],b=winF2[p2*4+(3-j)];bumpMu(a,'f3',b);bumpMu(b,'f3',a);winF3.push(s180(a,b));}
  }
  winF3.forEach(t=>ct[t].oit++);
  // === Oitavas (16 → 8): reseed por campanha ===
  const r16=[...winF3].sort((a,b)=>st[b].P-st[a].P||(st[b].GP-st[b].GC)-(st[a].GP-st[a].GC));
  const winOit=[];
  for(let i=0;i<8;i++){const a=r16[i],b=r16[15-i];bumpMu(a,'oit',b);bumpMu(b,'oit',a);winOit.push(s180(a,b));}
  winOit.forEach(t=>ct[t].qf++);
  // === Quartas (8 → 4): reseed ===
  const r8=[...winOit].sort((a,b)=>st[b].P-st[a].P);
  const qW=[],qL=[];
  for(let i=0;i<4;i++){const a=r8[i],b=r8[7-i];bumpMu(a,'qf',b);bumpMu(b,'qf',a);const w=s180(a,b);qW.push(w);qL.push(w===a?b:a);}
  qW.forEach(t=>ct[t].sf++);
  // === Semi + Playoff + Final ===
  qW.forEach(t=>ct[t].ac++);// 4 semifinalistas acessam
  // Playoff acesso: perdedores das QF se enfrentam
  bumpMu(qL[0],'po',qL[1]);bumpMu(qL[1],'po',qL[0]);bumpMu(qL[2],'po',qL[3]);bumpMu(qL[3],'po',qL[2]);
  const playoff=[s180(qL[0],qL[1]),s180(qL[2],qL[3])];playoff.forEach(t=>ct[t].ac++);// +2 vencedores playoff
  // Semi
  bumpMu(qW[0],'sf',qW[1]);bumpMu(qW[1],'sf',qW[0]);bumpMu(qW[2],'sf',qW[3]);bumpMu(qW[3],'sf',qW[2]);
  const sf1=s180(qW[0],qW[1]),sf2=s180(qW[2],qW[3]);ct[sf1].fin++;ct[sf2].fin++;
  // Final
  bumpMu(sf1,'fin',sf2);bumpMu(sf2,'fin',sf1);
  const champ=s180(sf1,sf2);ct[champ].ch++;
};

const simMC_D_finalize=(snap,ct,nS,gpts)=>{
  // Normaliza matchups do time: {adv: count} por fase → array [{adv, pct, count}] desc.
  const normMu=(mu)=>{const out={};for(const fase in mu){const m=mu[fase];const total=Object.values(m).reduce((s,v)=>s+v,0);out[fase]=Object.entries(m).map(([adv,c])=>({adv,pct:total>0?c/total*100:0,count:c})).sort((a,b)=>b.pct-a.pct);}return out;};
  const pctl=(arr,q)=>{if(!arr||!arr.length)return 0;const s=[...arr].sort((a,b)=>a-b);return s[Math.floor(s.length*q)]||0;};
  // Cortes esperados de pontos por grupo × posição (1º-4º). Para cada grupo gIdx
  // e posição pos (0-3), pctsPos[gIdx][pos] = {p10, p50, p90} dos pontos amostrais.
  const ptsCutsByGroup=gpts?gpts.map(grp=>grp.map(arr=>({p10:pctl(arr,0.1),p50:pctl(arr,0.5),p90:pctl(arr,0.9)}))):null;
  return{probs:SD_TIMES.map(t=>({
    time:t,uf:SD_INFO[t].uf,grupo:SD_INFO[t].grupo,
    elo:SD_INFO[t].elo,eloAtual:Math.round(snap.el[t]),
    atk:snap.at[t],def:snap.df[t],
    atkFinal:ct[t].atSum/nS,defFinal:ct[t].dfSum/nS,
    dE:Math.round(snap.el[t]-SD_INFO[t].elo),
    eloFinal:Math.round(ct[t].elFinalSum/nS),
    grupoTop1:ct[t].grupoTop1/nS*100,
    posGr:ct[t].posGr.map(v=>v/nS*100),
    f2:ct[t].f2/nS*100,f3:ct[t].f3/nS*100,
    oit:ct[t].oit/nS*100,qf:ct[t].qf/nS*100,sf:ct[t].sf/nS*100,fin:ct[t].fin/nS*100,
    ac:ct[t].ac/nS*100,ch:ct[t].ch/nS*100,
    ptsSamples:ct[t].ptsSamples,
    medianPts:pctl(ct[t].ptsSamples,0.5),
    p10Pts:pctl(ct[t].ptsSamples,0.1),
    p90Pts:pctl(ct[t].ptsSamples,0.9),
    mediaPts:ct[t].ptsSamples&&ct[t].ptsSamples.length?ct[t].ptsSamples.reduce((s,p)=>s+p,0)/ct[t].ptsSamples.length:0,
    matchups:normMu(ct[t].matchups)
  })).sort((a,b)=>b.ac-a.ac||b.elo-a.elo),nSims:nS,ptsCutsByGroup};
};

const simMC_D=(cfg,nS,ak,eo)=>{
  const tabD=SD_REAL_TAB;
  const snap=prepareSerieDState(cfg,eo,ak);
  const{mc,mf}=getML(cfg,'D');
  const ct={};SD_TIMES.forEach(t=>{ct[t]={grupoTop1:0,posGr:[0,0,0,0,0,0],f2:0,f3:0,oit:0,qf:0,sf:0,fin:0,ac:0,ch:0,elFinalSum:0,atSum:0,dfSum:0,ptsSamples:[],matchups:{}};});
  // gpts[gIdx][pos]: amostras de pontuação dos times que terminaram na (pos+1)ª
  // posição do grupo gIdx, ao longo das nS simulações. pos: 0-3 (1º-4º).
  const gpts=SD_GRUPOS.map(()=>[[],[],[],[]]);
  for(let sim=0;sim<nS;sim++)simMC_D_single(cfg,ak,eo,snap,tabD,ct,mc,mf,gpts);
  return simMC_D_finalize(snap,ct,nS,gpts);
};

const simMC_D_async=(cfg,nS,ak,eo,onProgress,onDone)=>{
  const tabD=SD_REAL_TAB;
  const snap=prepareSerieDState(cfg,eo,ak);
  const{mc,mf}=getML(cfg,'D');
  const ct={};SD_TIMES.forEach(t=>{ct[t]={grupoTop1:0,posGr:[0,0,0,0,0,0],f2:0,f3:0,oit:0,qf:0,sf:0,fin:0,ac:0,ch:0,elFinalSum:0,atSum:0,dfSum:0,ptsSamples:[],matchups:{}};});
  const gpts=SD_GRUPOS.map(()=>[[],[],[],[]]);
  const chunk=Math.max(10,Math.floor(nS/30));let done=0;
  const run=()=>{
    const end=Math.min(done+chunk,nS);
    for(;done<end;done++)simMC_D_single(cfg,ak,eo,snap,tabD,ct,mc,mf,gpts);
    onProgress(done,nS);
    if(done<nS)requestAnimationFrame(run);
    else onDone(simMC_D_finalize(snap,ct,nS,gpts));
  };
  requestAnimationFrame(run);
};
// === MC COPA DO BRASIL ===
// teamElos: Elos por time (evoluídos das sims A/B/C/D quando disponíveis).
// teamAD: atk/def por time (evoluídos idem). Fallback: lg.initAD(elo) como antes.
const simMC_CB=(cfg,nS,ak,eo,teamElos,teamAD)=>{
  const teams=CB_TEAMS;const elos={};teams.forEach(t=>elos[t]=teamElos[t]||CB_ELOS[t]||1200);
  const lg=initLeague(teams,t=>elos[t],cfg);
  const ct={};const matchups={};
  // matchups[time][fase] = {adversario: count}. Fases: r32, r16, qf, sf, fin.
  teams.forEach(t=>{ct[t]={r16:0,qf:0,sf:0,fin:0,ch:0};matchups[t]={r32:{},r16:{},qf:{},sf:{},fin:{}};});
  // bump(time, fase, adversario): incrementa contador de cruzamento
  const bump=(t,fase,adv)=>{matchups[t][fase][adv]=(matchups[t][fase][adv]||0)+1;};
  for(let sim=0;sim<nS;sim++){const at2={},df2={},el2={};teams.forEach(t=>{el2[t]=elos[t];
    // Prefere atk/def evoluídos (vindos das sims A/B/C/D); senão deriva via initAD(elo).
    if(teamAD&&teamAD[t]){at2[t]=teamAD[t].atk;df2[t]=teamAD[t].def;}
    else{const i=lg.initAD(elos[t]);at2[t]=i.atk;df2[t]=i.def;}
  });
    const s2L=(a,b)=>{const{mc:m1,mf:m2}=getML(cfg,'CB');const l1=calcL(at2[a],df2[a],at2[b],df2[b],el2[a],el2[b],m1,m2,cfg.homeAdv,eo,cfg.c0Log);const g1a=poissonRandom(l1.lC),g1b=poissonRandom(l1.lF);const l2=calcL(at2[b],df2[b],at2[a],df2[a],el2[b],el2[a],m1,m2,cfg.homeAdv,eo,cfg.c0Log);const g2b=poissonRandom(l2.lC),g2a=poissonRandom(l2.lF);const aa=g1a+g2a,ab2=g1b+g2b;return aa>ab2?a:ab2>aa?b:Math.random()<0.5?a:b;};
    // s2L_R32: variante que respeita IDA/VOLTA reais quando disponíveis.
    // ida={ga,gb} (a=mandante ida, b=visitante ida). volta inverte mando.
    // Se ida real existe: simula apenas o gap restante. Se ambas existem: vencedor determinístico.
    const s2L_R32=(a,b,ida,volta)=>{
      const{mc:m1,mf:m2}=getML(cfg,'CB');
      let g1a,g1b,g2a,g2b;
      if(ida){g1a=ida.ga;g1b=ida.gb;}
      else{const l1=calcL(at2[a],df2[a],at2[b],df2[b],el2[a],el2[b],m1,m2,cfg.homeAdv,eo,cfg.c0Log);g1a=poissonRandom(l1.lC);g1b=poissonRandom(l1.lF);}
      if(volta){g2b=volta.ga;g2a=volta.gb;} // mando inverte: ga=gols mandante volta=b
      else{const l2=calcL(at2[b],df2[b],at2[a],df2[a],el2[b],el2[a],m1,m2,cfg.homeAdv,eo,cfg.c0Log);g2b=poissonRandom(l2.lC);g2a=poissonRandom(l2.lF);}
      const aa=g1a+g2a,ab2=g1b+g2b;return aa>ab2?a:ab2>aa?b:(CB_R16_SET.has(a)?a:CB_R16_SET.has(b)?b:(Math.random()<0.5?a:b));
    };
    const sFin=(a,b)=>{const mn=cfg.mnMM;const r2=eo?(()=>{const d=el2[a]-el2[b];const e=1/(1+Math.pow(10,-d/400));return{lC:mn*(0.5+e),lF:mn*(0.5+(1-e))};})():{lC:Math.max(0.2,mn*at2[a]*df2[b]),lF:Math.max(0.2,mn*at2[b]*df2[a])};const ga=poissonRandom(r2.lC),gb=poissonRandom(r2.lF);return ga>gb?a:gb>ga?b:Math.random()<0.5?a:b;};
    // R32: adversários fixos (CB_R32). Aplica IDA/VOLTA reais quando existem (CB_RES_IDA/VOLTA).
    CB_R32.forEach(([ia,ib])=>{bump(teams[ia],'r32',teams[ib]);bump(teams[ib],'r32',teams[ia]);});
    const r32=CB_R32.map(([ia,ib],idx)=>s2L_R32(teams[ia],teams[ib],CB_RES_IDA[idx]||null,CB_RES_VOLTA[idx]||null));
    // R16: chaveamento real (sorteio já realizado) quando os 16 vencedores reais avançaram.
    const allReal16=r32.length===16&&r32.every(w=>CB_R16_SET.has(w));
    let r16p=[];
    if(allReal16){for(const[na,nb]of CB_R16_PAIRS){bump(na,'r16',nb);bump(nb,'r16',na);r16p.push(s2L(na,nb));}}
    else{const sh16=shuffle(r32);for(let i=0;i<sh16.length;i+=2){const a=sh16[i],b=sh16[i+1];bump(a,'r16',b);bump(b,'r16',a);r16p.push(s2L(a,b));}}
    const sh8=shuffle(r16p);const qfp=[];for(let i=0;i<sh8.length;i+=2){const a=sh8[i],b=sh8[i+1];bump(a,'qf',b);bump(b,'qf',a);qfp.push(s2L(a,b));}
    const sh4=shuffle(qfp);bump(sh4[0],'sf',sh4[1]);bump(sh4[1],'sf',sh4[0]);bump(sh4[2],'sf',sh4[3]);bump(sh4[3],'sf',sh4[2]);
    const sfp=[s2L(sh4[0],sh4[1]),s2L(sh4[2],sh4[3])];
    bump(sfp[0],'fin',sfp[1]);bump(sfp[1],'fin',sfp[0]);
    const fin=sFin(sfp[0],sfp[1]);
    r32.forEach(w=>ct[w].r16++);r16p.forEach(w=>ct[w].qf++);qfp.forEach(w=>ct[w].sf++);sfp.forEach(w=>ct[w].fin++);ct[fin].ch++;}
  // Normaliza matchups: cada {adversario:count} → array [{adv,pct}] ordenado desc
  const normMatchups=(t)=>{const out={};for(const fase of['r32','r16','qf','sf','fin']){
    const m=matchups[t][fase];const total=Object.values(m).reduce((s,v)=>s+v,0);
    out[fase]=Object.entries(m).map(([adv,c])=>({adv,pct:total>0?c/total*100:0,count:c})).sort((a,b)=>b.pct-a.pct);
  }return out;};
  return{probs:teams.map(t=>{
    const ad=(teamAD&&teamAD[t])?teamAD[t]:lg.initAD(elos[t]);
    return{time:t,elo:elos[t],atk:ad.atk,def:ad.def,r16:ct[t].r16/nS*100,qf:ct[t].qf/nS*100,sf:ct[t].sf/nS*100,fin:ct[t].fin/nS*100,ch:ct[t].ch/nS*100,matchups:normMatchups(t),evolved:!!(teamAD&&teamAD[t])};
  }).sort((a,b)=>b.ch-a.ch||b.elo-a.elo),nSims:nS};
};
const parseTab = (raw,nm,dates) => { const j=[];raw.forEach((s,ri)=>{s.split(',').forEach(g=>{const[c,f]=g.split('-');j.push({casa:nm[c],fora:nm[f],rodada:ri+1,data:(dates&&dates[ri])||''});});});return j; };

// Diagnóstico de integridade: verifica quantos resultados reais de cada série
// casam com a fixture. Para A/B/C usa match exato casa/fora/rodada (a CBF é a
// fonte das fixtures). Para D usa pairKey (agnóstico a mandante/ordem do par).
// Retorna também o ratio "seria casado pelo método antigo" para a D, documentando
// o impacto do fix implementado na v4.3.
const dataHealthReport = (SAT, SBT, SCT) => {
  const rep = {};
  // A/B/C: match exato
  const checkExact = (fixture, results, teams) => {
    const teamSet = new Set(teams);
    const fSet = new Set(fixture.map(j => `${j.casa}|${j.fora}|${j.rodada}`));
    const misses = [];
    for (const r of results) {
      if (!teamSet.has(r.c) || !teamSet.has(r.f)) { misses.push({...r, reason: 'time desconhecido'}); continue; }
      if (!fSet.has(`${r.c}|${r.f}|${r.r}`)) { misses.push({...r, reason: 'par/rodada não existe na fixture'}); }
    }
    return { total: results.length, matched: results.length - misses.length, misses };
  };
  rep.A = checkExact(SAT, SA_RES, Object.keys(SA_RANKING));
  rep.B = checkExact(SBT, SB_RES, Object.keys(SB_RANKING));
  rep.C = checkExact(SCT, SC_RES, Object.keys(SC_RANKING));
  // D: método antigo (match exato) vs novo (pairKey)
  const tabD = SD_REAL_TAB;
  const tabDExactSet = new Set(tabD.map(j => `${j.casa}|${j.fora}|${j.rodada}`));
  const tabDPairSet = new Set(tabD.map(j => pairKey(j.casa, j.fora, j.rodada)));
  const teamSetD = new Set(SD_TIMES);
  let dExact = 0, dPair = 0;
  const dMisses = [];
  for (const r of SD_RES) {
    if (!teamSetD.has(r.c) || !teamSetD.has(r.f)) { dMisses.push({...r, reason: 'time desconhecido'}); continue; }
    if (tabDExactSet.has(`${r.c}|${r.f}|${r.r}`)) dExact++;
    if (tabDPairSet.has(pairKey(r.c, r.f, r.r))) dPair++;
    else dMisses.push({...r, reason: 'par/turno não existe na fixture'});
  }
  rep.D = { total: SD_RES.length, matched: dPair, matchedOld: dExact, misses: dMisses };
  return rep;
};

// v4.35: validador estrutural de fixtures (#7). Roda 100% no navegador. Detecta
// regressões na hora de ingerir dados: confrontos duplicados, mando desbalanceado,
// returno que deixou de espelhar o turno, time jogando 2× na rodada, etc.
const fixtureIntegrity = (SAT, SBT, SCT) => {
  const rep = {};
  const groupByRound = (tab) => { const R = {}; tab.forEach(j => { (R[j.rodada] = R[j.rodada] || []).push([j.casa, j.fora]); }); return R; };
  const checkLeague = (tab, nTeams, type) => {
    const checks = []; const R = groupByRound(tab);
    const rounds = Object.keys(R).map(Number).sort((a, b) => a - b);
    const nR = type === 'duplo' ? (nTeams - 1) * 2 : (nTeams - 1);
    checks.push({ nome: `${nR} rodadas`, ok: rounds.length === nR, det: `${rounds.length} encontradas` });
    const badR = [];
    rounds.forEach(r => { const games = R[r]; const ts = new Set(); games.forEach(([c, f]) => { ts.add(c); ts.add(f); }); if (games.length !== nTeams / 2 || ts.size !== nTeams) badR.push(`R${r}(${games.length}j/${ts.size}t)`); });
    checks.push({ nome: `cada rodada: ${nTeams / 2} jogos, ${nTeams} times distintos`, ok: badR.length === 0, det: badR.length ? badR.join(' ') : 'todas ok' });
    const expTotal = type === 'duplo' ? nTeams * (nTeams - 1) : nTeams * (nTeams - 1) / 2;
    checks.push({ nome: `${expTotal} jogos no total`, ok: tab.length === expTotal, det: `${tab.length}` });
    const ordered = {}; tab.forEach(j => { const k = j.casa + '>' + j.fora; ordered[k] = (ordered[k] || 0) + 1; });
    const dupOrd = Object.entries(ordered).filter(([, v]) => v > 1);
    checks.push({ nome: 'sem confronto+mando repetido', ok: dupOrd.length === 0, det: dupOrd.length ? dupOrd.slice(0, 4).map(([k, v]) => k.replace('>', ' x ') + `×${v}`).join(', ') : '0 repetidos' });
    const unord = {}; tab.forEach(j => { const k = [j.casa, j.fora].sort().join('|'); unord[k] = (unord[k] || 0) + 1; });
    const expEach = type === 'duplo' ? 2 : 1;
    const badPairs = Object.entries(unord).filter(([, v]) => v !== expEach);
    checks.push({ nome: `cada confronto aparece ${expEach}×`, ok: badPairs.length === 0, det: badPairs.length ? badPairs.slice(0, 4).map(([k, v]) => k.replace('|', '-') + `×${v}`).join(', ') : 'todos ok' });
    if (type === 'duplo') {
      const home = {}, away = {}; tab.forEach(j => { home[j.casa] = (home[j.casa] || 0) + 1; away[j.fora] = (away[j.fora] || 0) + 1; });
      const exp = nTeams - 1; const badHA = Object.keys(home).filter(t => home[t] !== exp || away[t] !== exp);
      checks.push({ nome: `${exp} casa / ${exp} fora por time`, ok: badHA.length === 0, det: badHA.length ? badHA.slice(0, 4).join(', ') : 'balanceado' });
      const mirrorBad = [];
      for (let i = 1; i <= nR / 2; i++) {
        const t = (R[i] || []).map(([c, f]) => [c, f].sort().join('|')).sort().join(';');
        const ret = (R[i + nR / 2] || []).map(([c, f]) => [c, f].sort().join('|')).sort().join(';');
        if (t !== ret) mirrorBad.push(`R${i}↔R${i + nR / 2}`);
      }
      checks.push({ nome: 'returno espelha o turno', ok: mirrorBad.length === 0, det: mirrorBad.length ? mirrorBad.slice(0, 4).join(' ') : 'ok' });
    }
    return checks;
  };
  const checkD = () => {
    const checks = []; const tab = SD_REAL_TAB;
    checks.push({ nome: '480 jogos no total', ok: tab.length === 480, det: `${tab.length}` });
    const byR = {}; tab.forEach(j => { (byR[j.rodada] = byR[j.rodada] || []).push(j); });
    const rounds = Object.keys(byR).map(Number).sort((a, b) => a - b);
    const badRD = rounds.filter(r => byR[r].length !== 48);
    checks.push({ nome: '10 rodadas × 48 jogos', ok: rounds.length === 10 && badRD.length === 0, det: rounds.length !== 10 ? `${rounds.length} rodadas` : (badRD.length ? badRD.map(r => `R${r}(${byR[r].length})`).join(' ') : 'ok') });
    const byG = {}; tab.forEach(j => { (byG[j.grupo] = byG[j.grupo] || []).push(j); });
    const badG = [], badGPair = [], badGHA = [], crossGroup = [];
    Object.keys(byG).forEach(g => {
      const games = byG[g]; if (games.length !== 30) badG.push(`G${+g + 1}(${games.length})`);
      const unord = {}, home = {}, away = {}, ts = new Set();
      games.forEach(j => { const k = [j.casa, j.fora].sort().join('|'); unord[k] = (unord[k] || 0) + 1; home[j.casa] = (home[j.casa] || 0) + 1; away[j.fora] = (away[j.fora] || 0) + 1; ts.add(j.casa); ts.add(j.fora); });
      if (Object.values(unord).some(v => v !== 2)) badGPair.push(`G${+g + 1}`);
      [...ts].forEach(t => { if ((home[t] || 0) !== 5 || (away[t] || 0) !== 5) badGHA.push(`G${+g + 1}:${t}`); });
      const grpTeams = new Set(SD_GRUPOS[+g] || []);
      games.forEach(j => { if (!grpTeams.has(j.casa) || !grpTeams.has(j.fora)) crossGroup.push(`ref${j.ref}`); });
    });
    checks.push({ nome: '16 grupos × 30 jogos', ok: Object.keys(byG).length === 16 && badG.length === 0, det: badG.length ? badG.join(' ') : 'ok' });
    checks.push({ nome: 'cada confronto 2× por grupo', ok: badGPair.length === 0, det: badGPair.length ? badGPair.join(' ') : 'ok' });
    checks.push({ nome: '5 casa / 5 fora por time', ok: badGHA.length === 0, det: badGHA.length ? badGHA.slice(0, 4).join(' ') : 'balanceado' });
    checks.push({ nome: 'times só dentro do próprio grupo', ok: crossGroup.length === 0, det: crossGroup.length ? crossGroup.slice(0, 4).join(' ') : 'ok' });
    const multiPlay = [];
    rounds.forEach(r => { const cnt = {}; byR[r].forEach(j => { cnt[j.casa] = (cnt[j.casa] || 0) + 1; cnt[j.fora] = (cnt[j.fora] || 0) + 1; }); Object.entries(cnt).forEach(([t, v]) => { if (v > 1) multiPlay.push(`R${r}:${t}`); }); });
    checks.push({ nome: 'time joga ≤1× por rodada', ok: multiPlay.length === 0, det: multiPlay.length ? multiPlay.slice(0, 4).join(' ') : 'ok' });
    return checks;
  };
  rep.A = { checks: checkLeague(SAT, 20, 'duplo') };
  rep.B = { checks: checkLeague(SBT, 20, 'duplo') };
  rep.C = { checks: checkLeague(SCT, 20, 'unico') };
  rep.D = { checks: checkD() };
  ['A', 'B', 'C', 'D'].forEach(s => { rep[s].okCount = rep[s].checks.filter(c => c.ok).length; rep[s].total = rep[s].checks.length; });
  return rep;
};

// ============================================================================
// DADOS — SÉRIE A (datas oficiais CBF 2026)
// ============================================================================
const SA_DATES=['29/01','05/02','12/02','26/02','11/03','15/03','19/03','22/03','02/04','05/04','12/04','19/04','26/04','03/05','10/05','17/05','24/05','31/05','23/07','26/07','30/07','09/08','16/08','23/08','30/08','06/09','13/09','20/09','08/10','11/10','18/10','25/10','29/10','05/11','19/11','22/11','29/11','02/12'];
const SA_RANKING={'Flamengo':{elo:1720},'Palmeiras':{elo:1700},'Cruzeiro':{elo:1660},'Mirassol':{elo:1640},'Fluminense':{elo:1615},'Botafogo':{elo:1600},'Bahia':{elo:1575},'São Paulo':{elo:1555},'Internacional':{elo:1545},'Grêmio':{elo:1530},'Atlético-MG':{elo:1520},'Santos':{elo:1510},'Corinthians':{elo:1500},'Vasco':{elo:1485},'Red Bull Bragantino':{elo:1470},'Vitória':{elo:1450},'Coritiba':{elo:1400},'Athletico-PR':{elo:1390},'Chapecoense':{elo:1370},'Remo':{elo:1350}};
const SA_NM={'BAH':'Bahia','BOT':'Botafogo','BRA':'Red Bull Bragantino','CAM':'Atlético-MG','CAP':'Athletico-PR','CHA':'Chapecoense','COR':'Corinthians','CRU':'Cruzeiro','CTB':'Coritiba','FLA':'Flamengo','FLU':'Fluminense','GRE':'Grêmio','INT':'Internacional','MIR':'Mirassol','PAL':'Palmeiras','REM':'Remo','SAN':'Santos','SAO':'São Paulo','VAS':'Vasco','VIT':'Vitória'};
const SA_TAB=['FLU-GRE,BOT-CRU,SAO-FLA,COR-BAH,MIR-VAS,CAM-PAL,INT-CAP,CTB-BRA,VIT-REM,CHA-SAN','FLA-INT,VAS-CHA,SAN-SAO,PAL-VIT,BRA-CAM,CRU-CTB,GRE-BOT,CAP-COR,BAH-FLU,REM-MIR','FLU-BOT,VAS-BAH,SAO-GRE,COR-BRA,MIR-CRU,CAM-REM,INT-PAL,CAP-SAN,VIT-FLA,CHA-CTB','FLA-MIR,BOT-VIT,SAN-VAS,PAL-FLU,BRA-CAP,CRU-COR,GRE-CAM,CTB-SAO,BAH-CHA,REM-INT','FLA-CRU,VAS-PAL,SAO-CHA,COR-CTB,MIR-SAN,CAM-INT,GRE-BRA,CAP-BOT,BAH-VIT,REM-FLU','FLU-CAP,BOT-FLA,SAN-COR,PAL-MIR,BRA-SAO,CRU-VAS,INT-BAH,CTB-REM,VIT-CAM,CHA-GRE','FLA-REM,VAS-FLU,SAN-INT,PAL-BOT,MIR-CTB,CAM-SAO,GRE-VIT,CAP-CRU,BAH-BRA,CHA-COR','FLU-CAM,VAS-GRE,SAO-PAL,COR-FLA,BRA-BOT,CRU-SAN,INT-CHA,CAP-CTB,VIT-MIR,REM-BAH','FLU-COR,BOT-MIR,SAN-REM,PAL-GRE,BRA-FLA,CRU-VIT,INT-SAO,CTB-VAS,BAH-CAP,CHA-CAM','FLA-SAN,VAS-BOT,SAO-CRU,COR-INT,MIR-BRA,CAM-CAP,GRE-REM,CTB-FLU,BAH-PAL,CHA-VIT','FLU-FLA,BOT-CTB,SAN-CAM,COR-PAL,MIR-BAH,CRU-BRA,INT-GRE,CAP-CHA,VIT-SAO,REM-VAS','FLA-BAH,VAS-SAO,SAN-FLU,PAL-CAP,BRA-REM,CRU-GRE,INT-MIR,CTB-CAM,VIT-COR,CHA-BOT','FLU-CHA,BOT-INT,SAO-MIR,COR-VAS,BRA-PAL,CAM-FLA,GRE-CTB,CAP-VIT,BAH-SAN,REM-CRU','FLA-VAS,BOT-REM,SAO-BAH,PAL-SAN,MIR-COR,CRU-CAM,INT-FLU,CAP-GRE,VIT-CTB,CHA-BRA','FLU-VIT,VAS-CAP,SAN-BRA,COR-SAO,MIR-CHA,CAM-BOT,GRE-FLA,CTB-INT,BAH-CRU,REM-PAL','FLU-SAO,BOT-COR,SAN-CTB,PAL-CRU,BRA-VIT,CAM-MIR,INT-VAS,CAP-FLA,BAH-GRE,CHA-REM','FLA-PAL,VAS-BRA,SAO-BOT,COR-CAM,MIR-FLU,CRU-CHA,GRE-SAN,CTB-BAH,VIT-INT,REM-CAP','FLA-CTB,VAS-CAM,SAN-VIT,PAL-CHA,BRA-INT,CRU-FLU,GRE-COR,CAP-MIR,BAH-BOT,REM-SAO','FLU-BRA,BOT-SAN,SAO-CAP,COR-REM,MIR-GRE,CAM-BAH,INT-CRU,CTB-PAL,VIT-VAS,CHA-FLA','FLA-SAO,VAS-MIR,SAN-CHA,PAL-CAM,BRA-CTB,CRU-BOT,GRE-FLU,CAP-INT,BAH-COR,REM-VIT','FLU-BAH,BOT-GRE,SAO-SAN,COR-CAP,MIR-REM,CAM-BRA,INT-FLA,CTB-CRU,VIT-PAL,CHA-VAS','FLA-VIT,BOT-FLU,SAN-CAP,PAL-INT,BRA-COR,CRU-MIR,GRE-SAO,CTB-CHA,BAH-VAS,REM-CAM','FLU-PAL,VAS-SAN,SAO-CTB,COR-CRU,MIR-FLA,CAM-GRE,INT-REM,CAP-BRA,VIT-BOT,CHA-BAH','FLU-REM,BOT-CAP,SAN-MIR,PAL-VAS,BRA-GRE,CRU-FLA,INT-CAM,CTB-COR,VIT-BAH,CHA-SAO','FLA-BOT,VAS-CRU,SAO-BRA,COR-SAN,MIR-PAL,CAM-VIT,GRE-CHA,CAP-FLU,BAH-INT,REM-CTB','FLU-VAS,BOT-PAL,SAO-CAM,COR-CHA,BRA-BAH,CRU-CAP,INT-SAN,CTB-MIR,VIT-GRE,REM-FLA','FLA-COR,BOT-BRA,SAN-CRU,PAL-SAO,MIR-VIT,CAM-FLU,GRE-VAS,CTB-CAP,BAH-REM,CHA-INT','FLA-BRA,VAS-CTB,SAO-INT,COR-FLU,MIR-BOT,CAM-CHA,GRE-PAL,CAP-BAH,VIT-CRU,REM-SAN','FLU-CTB,BOT-VAS,SAN-FLA,PAL-BAH,BRA-MIR,CRU-SAO,INT-COR,CAP-CAM,VIT-CHA,REM-GRE','FLA-FLU,VAS-REM,SAO-VIT,PAL-COR,BRA-CRU,CAM-SAN,GRE-INT,CTB-BOT,BAH-MIR,CHA-CAP','FLU-SAN,BOT-CHA,SAO-VAS,COR-VIT,MIR-INT,CAM-CTB,GRE-CRU,CAP-PAL,BAH-FLA,REM-BRA','FLA-CAM,VAS-COR,SAN-BAH,PAL-BRA,MIR-SAO,CRU-REM,INT-BOT,CTB-GRE,VIT-CAP,CHA-FLU','FLU-INT,VAS-FLA,SAN-PAL,COR-MIR,BRA-CHA,CAM-CRU,GRE-CAP,CTB-VIT,BAH-SAO,REM-BOT','FLA-GRE,BOT-CAM,SAO-COR,PAL-REM,BRA-SAN,CRU-BAH,INT-CTB,CAP-VAS,VIT-FLU,CHA-MIR','FLA-CAP,VAS-INT,SAO-FLU,COR-BOT,MIR-CAM,CRU-PAL,GRE-BAH,CTB-SAN,VIT-BRA,REM-CHA','FLU-MIR,BOT-SAO,SAN-GRE,PAL-FLA,BRA-VAS,CAM-COR,INT-VIT,CAP-REM,BAH-CTB,CHA-CRU','FLU-CRU,BOT-BAH,SAO-REM,COR-GRE,MIR-CAP,CAM-VAS,INT-BRA,CTB-FLA,VIT-SAN,CHA-PAL','FLA-CHA,VAS-VIT,SAN-BOT,PAL-CTB,BRA-FLU,CRU-INT,GRE-MIR,CAP-SAO,BAH-CAM,REM-COR'];
const SA_RES=[{c:'Fluminense',f:'Grêmio',gc:2,gf:1,r:1},{c:'Botafogo',f:'Cruzeiro',gc:4,gf:0,r:1},{c:'São Paulo',f:'Flamengo',gc:2,gf:1,r:1},{c:'Corinthians',f:'Bahia',gc:1,gf:2,r:1},{c:'Mirassol',f:'Vasco',gc:2,gf:1,r:1},{c:'Atlético-MG',f:'Palmeiras',gc:2,gf:2,r:1},{c:'Internacional',f:'Athletico-PR',gc:0,gf:1,r:1},{c:'Coritiba',f:'Red Bull Bragantino',gc:0,gf:1,r:1},{c:'Vitória',f:'Remo',gc:2,gf:0,r:1},{c:'Chapecoense',f:'Santos',gc:4,gf:2,r:1},{c:'Flamengo',f:'Internacional',gc:1,gf:1,r:2},{c:'Vasco',f:'Chapecoense',gc:1,gf:1,r:2},{c:'Santos',f:'São Paulo',gc:1,gf:1,r:2},{c:'Palmeiras',f:'Vitória',gc:5,gf:1,r:2},{c:'Red Bull Bragantino',f:'Atlético-MG',gc:1,gf:0,r:2},{c:'Cruzeiro',f:'Coritiba',gc:1,gf:2,r:2},{c:'Grêmio',f:'Botafogo',gc:5,gf:3,r:2},{c:'Bahia',f:'Fluminense',gc:1,gf:1,r:2},{c:'Remo',f:'Mirassol',gc:2,gf:2,r:2},{c:'Fluminense',f:'Botafogo',gc:1,gf:0,r:3},{c:'Vasco',f:'Bahia',gc:0,gf:1,r:3},{c:'São Paulo',f:'Grêmio',gc:2,gf:0,r:3},{c:'Corinthians',f:'Red Bull Bragantino',gc:2,gf:0,r:3},{c:'Mirassol',f:'Cruzeiro',gc:2,gf:2,r:3},{c:'Atlético-MG',f:'Remo',gc:3,gf:3,r:3},{c:'Internacional',f:'Palmeiras',gc:1,gf:3,r:3},{c:'Athletico-PR',f:'Santos',gc:2,gf:1,r:3},{c:'Vitória',f:'Flamengo',gc:1,gf:2,r:3},{c:'Chapecoense',f:'Coritiba',gc:3,gf:3,r:3},{c:'Santos',f:'Vasco',gc:2,gf:1,r:4},{c:'Palmeiras',f:'Fluminense',gc:2,gf:1,r:4},{c:'Red Bull Bragantino',f:'Athletico-PR',gc:1,gf:1,r:4},{c:'Cruzeiro',f:'Corinthians',gc:1,gf:1,r:4},{c:'Grêmio',f:'Atlético-MG',gc:2,gf:1,r:4},{c:'Coritiba',f:'São Paulo',gc:0,gf:1,r:4},{c:'Remo',f:'Internacional',gc:1,gf:1,r:4},{c:'Flamengo',f:'Cruzeiro',gc:2,gf:0,r:5},{c:'Vasco',f:'Palmeiras',gc:2,gf:1,r:5},{c:'São Paulo',f:'Chapecoense',gc:2,gf:0,r:5},{c:'Corinthians',f:'Coritiba',gc:0,gf:2,r:5},{c:'Mirassol',f:'Santos',gc:2,gf:2,r:5},{c:'Atlético-MG',f:'Internacional',gc:1,gf:0,r:5},{c:'Grêmio',f:'Red Bull Bragantino',gc:1,gf:1,r:5},{c:'Bahia',f:'Vitória',gc:1,gf:1,r:5},{c:'Remo',f:'Fluminense',gc:0,gf:2,r:5},{c:'Fluminense',f:'Athletico-PR',gc:3,gf:2,r:6},{c:'Botafogo',f:'Flamengo',gc:0,gf:3,r:6},{c:'Santos',f:'Corinthians',gc:1,gf:1,r:6},{c:'Palmeiras',f:'Mirassol',gc:1,gf:0,r:6},{c:'Red Bull Bragantino',f:'São Paulo',gc:1,gf:2,r:6},{c:'Cruzeiro',f:'Vasco',gc:3,gf:3,r:6},{c:'Internacional',f:'Bahia',gc:0,gf:1,r:6},{c:'Coritiba',f:'Remo',gc:1,gf:0,r:6},{c:'Vitória',f:'Atlético-MG',gc:2,gf:0,r:6},{c:'Chapecoense',f:'Grêmio',gc:1,gf:1,r:6},{c:'Flamengo',f:'Remo',gc:3,gf:0,r:7},{c:'Vasco',f:'Fluminense',gc:3,gf:2,r:7},{c:'Santos',f:'Internacional',gc:1,gf:2,r:7},{c:'Palmeiras',f:'Botafogo',gc:2,gf:1,r:7},{c:'Mirassol',f:'Coritiba',gc:0,gf:1,r:7},{c:'Atlético-MG',f:'São Paulo',gc:1,gf:0,r:7},{c:'Grêmio',f:'Vitória',gc:2,gf:0,r:7},{c:'Athletico-PR',f:'Cruzeiro',gc:2,gf:1,r:7},{c:'Bahia',f:'Red Bull Bragantino',gc:2,gf:0,r:7},{c:'Chapecoense',f:'Corinthians',gc:0,gf:0,r:7},{c:'Fluminense',f:'Atlético-MG',gc:1,gf:0,r:8},{c:'Vasco',f:'Grêmio',gc:2,gf:1,r:8},{c:'São Paulo',f:'Palmeiras',gc:0,gf:1,r:8},{c:'Corinthians',f:'Flamengo',gc:1,gf:1,r:8},{c:'Red Bull Bragantino',f:'Botafogo',gc:1,gf:2,r:8},{c:'Cruzeiro',f:'Santos',gc:0,gf:0,r:8},{c:'Internacional',f:'Chapecoense',gc:2,gf:0,r:8},{c:'Athletico-PR',f:'Coritiba',gc:2,gf:0,r:8},{c:'Vitória',f:'Mirassol',gc:1,gf:0,r:8},{c:'Remo',f:'Bahia',gc:4,gf:1,r:8},{c:'Fluminense',f:'Corinthians',gc:3,gf:1,r:9},{c:'Botafogo',f:'Mirassol',gc:3,gf:2,r:9},{c:'Santos',f:'Remo',gc:2,gf:0,r:9},{c:'Palmeiras',f:'Grêmio',gc:2,gf:1,r:9},{c:'Red Bull Bragantino',f:'Flamengo',gc:3,gf:0,r:9},{c:'Cruzeiro',f:'Vitória',gc:3,gf:0,r:9},{c:'Internacional',f:'São Paulo',gc:1,gf:1,r:9},{c:'Coritiba',f:'Vasco',gc:1,gf:1,r:9},{c:'Bahia',f:'Athletico-PR',gc:3,gf:0,r:9},{c:'Chapecoense',f:'Atlético-MG',gc:0,gf:4,r:9},{c:'São Paulo',f:'Cruzeiro',gc:4,gf:1,r:10},{c:'Coritiba',f:'Fluminense',gc:1,gf:1,r:10},{c:'Vasco',f:'Botafogo',gc:1,gf:2,r:10},{c:'Chapecoense',f:'Vitória',gc:1,gf:1,r:10},{c:'Atlético-MG',f:'Athletico-PR',gc:2,gf:1,r:10},{c:'Flamengo',f:'Santos',gc:3,gf:1,r:10},{c:'Bahia',f:'Palmeiras',gc:1,gf:2,r:10},{c:'Corinthians',f:'Internacional',gc:0,gf:1,r:10},{c:'Mirassol',f:'Red Bull Bragantino',gc:0,gf:1,r:10},{c:'Grêmio',f:'Remo',gc:0,gf:0,r:10},{c:'Vitória',f:'São Paulo',gc:2,gf:0,r:11},{c:'Remo',f:'Vasco',gc:1,gf:1,r:11},{c:'Mirassol',f:'Bahia',gc:1,gf:2,r:11},{c:'Santos',f:'Atlético-MG',gc:1,gf:0,r:11},{c:'Internacional',f:'Grêmio',gc:0,gf:0,r:11},{c:'Athletico-PR',f:'Chapecoense',gc:2,gf:0,r:11},{c:'Botafogo',f:'Coritiba',gc:2,gf:2,r:11},{c:'Fluminense',f:'Flamengo',gc:1,gf:2,r:11},{c:'Corinthians',f:'Palmeiras',gc:0,gf:0,r:11},{c:'Cruzeiro',f:'Red Bull Bragantino',gc:2,gf:1,r:11},{c:'Flamengo',f:'Bahia',gc:2,gf:0,r:12},{c:'Vasco',f:'São Paulo',gc:2,gf:1,r:12},{c:'Santos',f:'Fluminense',gc:2,gf:3,r:12},{c:'Palmeiras',f:'Athletico-PR',gc:1,gf:0,r:12},{c:'Red Bull Bragantino',f:'Remo',gc:4,gf:2,r:12},{c:'Cruzeiro',f:'Grêmio',gc:2,gf:0,r:12},{c:'Internacional',f:'Mirassol',gc:1,gf:2,r:12},{c:'Coritiba',f:'Atlético-MG',gc:2,gf:0,r:12},{c:'Vitória',f:'Corinthians',gc:0,gf:0,r:12},{c:'Chapecoense',f:'Botafogo',gc:1,gf:4,r:12},{c:'Bahia',f:'Santos',gc:2,gf:2,r:13},{c:'Remo',f:'Cruzeiro',gc:0,gf:1,r:13},{c:'Botafogo',f:'Internacional',gc:2,gf:2,r:13},{c:'São Paulo',f:'Mirassol',gc:1,gf:0,r:13},{c:'Grêmio',f:'Coritiba',gc:1,gf:0,r:13},{c:'Corinthians',f:'Vasco',gc:1,gf:0,r:13},{c:'Athletico-PR',f:'Vitória',gc:3,gf:1,r:13},{c:'Red Bull Bragantino',f:'Palmeiras',gc:0,gf:1,r:13},{c:'Atlético-MG',f:'Flamengo',gc:0,gf:4,r:13},{c:'Fluminense',f:'Chapecoense',gc:2,gf:1,r:13},{c:'Athletico-PR',f:'Corinthians',gc:0,gf:1,r:2},{c:'Athletico-PR',f:'Botafogo',gc:4,gf:1,r:5},
// R14 (02-03/05/2026)
{c:'Flamengo',f:'Vasco',gc:2,gf:2,r:14},{c:'Botafogo',f:'Remo',gc:1,gf:2,r:14},{c:'São Paulo',f:'Bahia',gc:2,gf:2,r:14},{c:'Palmeiras',f:'Santos',gc:1,gf:1,r:14},{c:'Mirassol',f:'Corinthians',gc:2,gf:1,r:14},{c:'Cruzeiro',f:'Atlético-MG',gc:1,gf:3,r:14},{c:'Internacional',f:'Fluminense',gc:2,gf:0,r:14},{c:'Athletico-PR',f:'Grêmio',gc:0,gf:0,r:14},{c:'Vitória',f:'Coritiba',gc:4,gf:1,r:14},{c:'Chapecoense',f:'Red Bull Bragantino',gc:1,gf:2,r:14},
// R15 (09-10/05/2026)
{c:'Fluminense',f:'Vitória',gc:2,gf:2,r:15},{c:'Vasco',f:'Athletico-PR',gc:1,gf:0,r:15},{c:'Santos',f:'Red Bull Bragantino',gc:2,gf:0,r:15},{c:'Corinthians',f:'São Paulo',gc:3,gf:2,r:15},{c:'Mirassol',f:'Chapecoense',gc:1,gf:1,r:15},{c:'Atlético-MG',f:'Botafogo',gc:1,gf:1,r:15},{c:'Grêmio',f:'Flamengo',gc:0,gf:1,r:15},{c:'Coritiba',f:'Internacional',gc:2,gf:2,r:15},{c:'Bahia',f:'Cruzeiro',gc:1,gf:2,r:15},{c:'Remo',f:'Palmeiras',gc:1,gf:1,r:15},
// R16 (16-17/05/2026)
{c:'Fluminense',f:'São Paulo',gc:2,gf:1,r:16},{c:'Botafogo',f:'Corinthians',gc:3,gf:1,r:16},{c:'Santos',f:'Coritiba',gc:0,gf:3,r:16},{c:'Palmeiras',f:'Cruzeiro',gc:1,gf:1,r:16},{c:'Red Bull Bragantino',f:'Vitória',gc:2,gf:0,r:16},{c:'Atlético-MG',f:'Mirassol',gc:3,gf:1,r:16},{c:'Internacional',f:'Vasco',gc:4,gf:1,r:16},{c:'Athletico-PR',f:'Flamengo',gc:1,gf:1,r:16},{c:'Bahia',f:'Grêmio',gc:1,gf:1,r:16},{c:'Chapecoense',f:'Remo',gc:2,gf:3,r:16},
// R17 (24-25/05/2026) — fim do 1º turno se aproxima; Palmeiras isolado (38)
{c:'Flamengo',f:'Palmeiras',gc:0,gf:3,r:17},{c:'Vasco',f:'Red Bull Bragantino',gc:0,gf:3,r:17},{c:'São Paulo',f:'Botafogo',gc:1,gf:1,r:17},{c:'Corinthians',f:'Atlético-MG',gc:1,gf:0,r:17},{c:'Mirassol',f:'Fluminense',gc:1,gf:0,r:17},{c:'Cruzeiro',f:'Chapecoense',gc:2,gf:1,r:17},{c:'Grêmio',f:'Santos',gc:3,gf:2,r:17},{c:'Coritiba',f:'Bahia',gc:3,gf:2,r:17},{c:'Vitória',f:'Internacional',gc:2,gf:0,r:17},{c:'Remo',f:'Athletico-PR',gc:1,gf:2,r:17},{c:'Flamengo',f:'Coritiba',gc:3,gf:0,r:18},{c:'Athletico-PR',f:'Mirassol',gc:1,gf:0,r:18},{c:'Grêmio',f:'Corinthians',gc:1,gf:3,r:18},{c:'Bahia',f:'Botafogo',gc:2,gf:1,r:18},{c:'Santos',f:'Vitória',gc:3,gf:1,r:18},{c:'Red Bull Bragantino',f:'Internacional',gc:3,gf:1,r:18},{c:'Vasco',f:'Atlético-MG',gc:0,gf:1,r:18},{c:'Palmeiras',f:'Chapecoense',gc:1,gf:0,r:18},{c:'Cruzeiro',f:'Fluminense',gc:1,gf:1,r:18},{c:'Remo',f:'São Paulo',gc:1,gf:0,r:18}];
const SA_META={key:'A',nR:38,nReb:4,zonas:{g4:4,g4L:'Libertadores (G4)',g6:6,g6L:'Pré-Liberta (5-6)',g8:8,g8L:'Sul-Americana (7-8)',z4:17}};

// === SÉRIE B ===
const SB_DATES=['22/03','01/04','05/04','12/04','19/04','26/04','03/05','10/05','17/05','24/05','31/05','07/06','14/06','21/06','28/06','05/07','12/07','19/07','26/07','02/08','09/08','16/08','23/08','30/08','06/09','13/09','20/09','27/09','04/10','11/10','18/10','25/10','01/11','08/11','15/11','22/11','25/11','28/11'];
const SB_RANKING={'Fortaleza':{elo:1400},'Ceará':{elo:1400},'Sport':{elo:1350},'Juventude':{elo:1350},'Criciúma':{elo:1340},'Goiás':{elo:1340},'Novorizontino':{elo:1340},'CRB':{elo:1340},'Avaí':{elo:1340},'Cuiabá':{elo:1340},'Atlético-GO':{elo:1340},'Operário-PR':{elo:1340},'Vila Nova':{elo:1340},'América-MG':{elo:1340},'Athletic':{elo:1340},'Botafogo-SP':{elo:1340},'Ponte Preta':{elo:1340},'Londrina':{elo:1340},'Náutico':{elo:1340},'São Bernardo':{elo:1340}};
const SB_NM={'AGO':'Atlético-GO','AMG':'América-MG','ATH':'Athletic','AVA':'Avaí','BSP':'Botafogo-SP','CEA':'Ceará','CRB':'CRB','CRI':'Criciúma','CUI':'Cuiabá','FOR':'Fortaleza','GOI':'Goiás','JUV':'Juventude','LON':'Londrina','NAU':'Náutico','NOV':'Novorizontino','OPR':'Operário-PR','PPR':'Ponte Preta','SBR':'São Bernardo','SPT':'Sport','VLN':'Vila Nova'};
const SB_TAB=['CEA-SBR,VLN-CRB,OPR-AGO,BSP-FOR,CUI-SPT,AVA-JUV,NAU-CRI,ATH-PPR,GOI-AMG,NOV-LON','JUV-NOV,FOR-CUI,AMG-BSP,LON-GOI,AGO-NAU,SPT-VLN,PPR-CEA,CRI-ATH,CRB-AVA,SBR-OPR','FOR-JUV,NAU-PPR,CUI-CEA,VLN-AGO,LON-SPT,AVA-OPR,NOV-CRB,ATH-AMG,BSP-SBR,GOI-CRI','CRI-BSP,JUV-GOI,PPR-VLN,SPT-AVA,CEA-NAU,AMG-NOV,OPR-CUI,SBR-FOR,CRB-ATH,AGO-LON','AMG-SPT,NAU-SBR,VLN-OPR,AVA-PPR,CRB-JUV,BSP-AGO,LON-CEA,GOI-CUI,NOV-ATH,FOR-CRI','CUI-BSP,PPR-AMG,SPT-NOV,JUV-LON,SBR-GOI,OPR-FOR,CEA-VLN,AGO-AVA,CRI-CRB,ATH-NAU','BSP-NAU,CUI-CRI,FOR-GOI,SBR-PPR,OPR-LON,SPT-CEA,AGO-JUV,AMG-CRB,AVA-NOV,VLN-ATH','GOI-VLN,ATH-CUI,PPR-SPT,CEA-AGO,CRB-OPR,JUV-CRI,NAU-AMG,AVA-FOR,NOV-BSP,LON-SBR','SBR-AMG,OPR-NAU,GOI-BSP,CUI-NOV,ATH-JUV,VLN-AVA,CRI-AGO,CEA-FOR,SPT-CRB,PPR-LON','NAU-CUI,NOV-CEA,FOR-LON,JUV-SPT,AGO-SBR,CRB-PPR,AMG-VLN,AVA-GOI,OPR-CRI,BSP-ATH','JUV-AMG,AGO-GOI,AVA-CRI,ATH-FOR,SPT-NAU,SBR-NOV,LON-VLN,CEA-OPR,CUI-CRB,PPR-BSP','OPR-JUV,CRI-LON,CRB-SBR,AMG-AGO,VLN-BSP,PPR-CUI,NAU-FOR,CEA-AVA,GOI-NOV,SPT-ATH','AGO-CRB,SBR-SPT,JUV-PPR,ATH-GOI,CUI-VLN,BSP-OPR,NOV-NAU,LON-AVA,CRI-CEA,FOR-AMG','GOI-OPR,SPT-AGO,LON-ATH,VLN-NAU,CEA-BSP,SBR-JUV,AVA-CUI,CRB-FOR,PPR-NOV,AMG-CRI','CUI-LON,NOV-VLN,OPR-AMG,CRI-SBR,JUV-CEA,ATH-AVA,AGO-PPR,FOR-SPT,NAU-GOI,BSP-CRB','CUI-AMG,FOR-PPR,CRI-SPT,NOV-AGO,LON-CRB,GOI-CEA,NAU-JUV,BSP-AVA,VLN-SBR,ATH-OPR','PPR-CRI,JUV-VLN,SPT-BSP,OPR-NOV,SBR-CUI,AVA-NAU,AGO-FOR,CRB-GOI,AMG-LON,CEA-ATH','CRB-NAU,SBR-AVA,AMG-CEA,JUV-CUI,FOR-NOV,CRI-VLN,PPR-GOI,SPT-OPR,AGO-ATH,LON-BSP','BSP-JUV,NOV-CRI,ATH-SBR,OPR-PPR,CEA-CRB,GOI-SPT,AVA-AMG,NAU-LON,CUI-AGO,VLN-FOR','SBR-CEA,CRB-VLN,AGO-OPR,FOR-BSP,SPT-CUI,JUV-AVA,CRI-NAU,PPR-ATH,AMG-GOI,LON-NOV','NOV-JUV,CUI-FOR,BSP-AMG,GOI-LON,NAU-AGO,VLN-SPT,CEA-PPR,ATH-CRI,AVA-CRB,OPR-SBR','JUV-FOR,PPR-NAU,CEA-CUI,AGO-VLN,SPT-LON,OPR-AVA,CRB-NOV,AMG-ATH,SBR-BSP,CRI-GOI','BSP-CRI,GOI-JUV,VLN-PPR,AVA-SPT,NAU-CEA,NOV-AMG,CUI-OPR,FOR-SBR,ATH-CRB,LON-AGO','SPT-AMG,SBR-NAU,OPR-VLN,PPR-AVA,JUV-CRB,AGO-BSP,CEA-LON,CUI-GOI,ATH-NOV,CRI-FOR','BSP-CUI,AMG-PPR,NOV-SPT,LON-JUV,GOI-SBR,FOR-OPR,VLN-CEA,AVA-AGO,CRB-CRI,NAU-ATH','NAU-BSP,CRI-CUI,GOI-FOR,PPR-SBR,LON-OPR,CEA-SPT,JUV-AGO,CRB-AMG,NOV-AVA,ATH-VLN','VLN-GOI,CUI-ATH,SPT-PPR,AGO-CEA,OPR-CRB,CRI-JUV,AMG-NAU,FOR-AVA,BSP-NOV,SBR-LON','AMG-SBR,NAU-OPR,BSP-GOI,NOV-CUI,JUV-ATH,AVA-VLN,AGO-CRI,FOR-CEA,CRB-SPT,LON-PPR','CUI-NAU,CEA-NOV,LON-FOR,SPT-JUV,SBR-AGO,PPR-CRB,VLN-AMG,GOI-AVA,CRI-OPR,ATH-BSP','AMG-JUV,GOI-AGO,CRI-AVA,FOR-ATH,NAU-SPT,NOV-SBR,VLN-LON,OPR-CEA,CRB-CUI,BSP-PPR','JUV-OPR,LON-CRI,SBR-CRB,AGO-AMG,BSP-VLN,CUI-PPR,FOR-NAU,AVA-CEA,NOV-GOI,ATH-SPT','CRB-AGO,SPT-SBR,PPR-JUV,GOI-ATH,VLN-CUI,OPR-BSP,NAU-NOV,AVA-LON,CEA-CRI,AMG-FOR','OPR-GOI,AGO-SPT,ATH-LON,NAU-VLN,BSP-CEA,JUV-SBR,CUI-AVA,FOR-CRB,NOV-PPR,CRI-AMG','LON-CUI,VLN-NOV,AMG-OPR,SBR-CRI,CEA-JUV,AVA-ATH,PPR-AGO,SPT-FOR,GOI-NAU,CRB-BSP','AMG-CUI,PPR-FOR,SPT-CRI,AGO-NOV,CRB-LON,CEA-GOI,JUV-NAU,AVA-BSP,SBR-VLN,OPR-ATH','CRI-PPR,VLN-JUV,BSP-SPT,NOV-OPR,CUI-SBR,NAU-AVA,FOR-AGO,GOI-CRB,LON-AMG,ATH-CEA','NAU-CRB,AVA-SBR,CEA-AMG,CUI-JUV,NOV-FOR,VLN-CRI,GOI-PPR,OPR-SPT,ATH-AGO,BSP-LON','JUV-BSP,CRI-NOV,SBR-ATH,PPR-OPR,CRB-CEA,SPT-GOI,AMG-AVA,LON-NAU,AGO-CUI,FOR-VLN'];
const SB_RES=[{c:'Botafogo-SP',f:'Fortaleza',gc:4,gf:0,r:1},{c:'Novorizontino',f:'Londrina',gc:1,gf:3,r:1},{c:'Athletic',f:'Ponte Preta',gc:2,gf:1,r:1},{c:'Operário-PR',f:'Atlético-GO',gc:1,gf:0,r:1},{c:'Ceará',f:'São Bernardo',gc:1,gf:1,r:1},{c:'Goiás',f:'América-MG',gc:3,gf:1,r:1},{c:'Avaí',f:'Juventude',gc:2,gf:0,r:1},{c:'Náutico',f:'Criciúma',gc:0,gf:1,r:1},{c:'Cuiabá',f:'Sport',gc:0,gf:0,r:1},{c:'Vila Nova',f:'CRB',gc:2,gf:2,r:1},{c:'Ponte Preta',f:'Ceará',gc:1,gf:1,r:2},{c:'São Bernardo',f:'Operário-PR',gc:1,gf:2,r:2},{c:'América-MG',f:'Botafogo-SP',gc:1,gf:2,r:2},{c:'Londrina',f:'Goiás',gc:2,gf:2,r:2},{c:'Fortaleza',f:'Cuiabá',gc:0,gf:0,r:2},{c:'Atlético-GO',f:'Náutico',gc:1,gf:2,r:2},{c:'Criciúma',f:'Athletic',gc:1,gf:1,r:2},{c:'Sport',f:'Vila Nova',gc:1,gf:1,r:2},{c:'CRB',f:'Avaí',gc:0,gf:1,r:2},{c:'Juventude',f:'Novorizontino',gc:0,gf:0,r:2},{c:'Botafogo-SP',f:'São Bernardo',gc:1,gf:2,r:3},{c:'Fortaleza',f:'Juventude',gc:2,gf:1,r:3},{c:'Náutico',f:'Ponte Preta',gc:1,gf:0,r:3},{c:'Cuiabá',f:'Ceará',gc:0,gf:2,r:3},{c:'Vila Nova',f:'Atlético-GO',gc:2,gf:1,r:3},{c:'Londrina',f:'Sport',gc:1,gf:2,r:3},{c:'Avaí',f:'Operário-PR',gc:0,gf:0,r:3},{c:'Novorizontino',f:'CRB',gc:1,gf:1,r:3},{c:'Athletic',f:'América-MG',gc:1,gf:1,r:3},{c:'Goiás',f:'Criciúma',gc:1,gf:0,r:3},{c:'Criciúma',f:'Botafogo-SP',gc:1,gf:0,r:4},{c:'Sport',f:'Avaí',gc:2,gf:2,r:4},{c:'Ceará',f:'Náutico',gc:1,gf:0,r:4},{c:'Ponte Preta',f:'Vila Nova',gc:0,gf:1,r:4},{c:'São Bernardo',f:'Fortaleza',gc:0,gf:1,r:4},{c:'América-MG',f:'Novorizontino',gc:0,gf:3,r:4},{c:'Operário-PR',f:'Cuiabá',gc:0,gf:0,r:4},{c:'Atlético-GO',f:'Londrina',gc:2,gf:1,r:4},{c:'CRB',f:'Athletic',gc:2,gf:3,r:4},{c:'Juventude',f:'Goiás',gc:2,gf:0,r:4},{c:'Botafogo-SP',f:'Atlético-GO',gc:1,gf:1,r:5},{c:'Novorizontino',f:'Athletic',gc:2,gf:1,r:5},{c:'América-MG',f:'Sport',gc:0,gf:0,r:5},{c:'Londrina',f:'Ceará',gc:0,gf:0,r:5},{c:'Fortaleza',f:'Criciúma',gc:3,gf:2,r:5},{c:'Goiás',f:'Cuiabá',gc:0,gf:2,r:5},{c:'Avaí',f:'Ponte Preta',gc:1,gf:2,r:5},{c:'Náutico',f:'São Bernardo',gc:0,gf:3,r:5},{c:'CRB',f:'Juventude',gc:0,gf:1,r:5},{c:'Vila Nova',f:'Operário-PR',gc:2,gf:1,r:5},{c:'Sport',f:'Novorizontino',gc:1,gf:0,r:6},{c:'Juventude',f:'Londrina',gc:1,gf:0,r:6},{c:'São Bernardo',f:'Goiás',gc:1,gf:0,r:6},{c:'Operário-PR',f:'Fortaleza',gc:0,gf:0,r:6},{c:'Ceará',f:'Vila Nova',gc:3,gf:3,r:6},{c:'Atlético-GO',f:'Avaí',gc:2,gf:1,r:6},{c:'Criciúma',f:'CRB',gc:3,gf:1,r:6},{c:'Cuiabá',f:'Botafogo-SP',gc:1,gf:1,r:6},{c:'Ponte Preta',f:'América-MG',gc:1,gf:0,r:6},{c:'Athletic',f:'Náutico',gc:0,gf:1,r:6},
// R7 (02-04/05/2026)
{c:'Botafogo-SP',f:'Náutico',gc:1,gf:1,r:7},{c:'Cuiabá',f:'Criciúma',gc:1,gf:1,r:7},{c:'Fortaleza',f:'Goiás',gc:4,gf:1,r:7},{c:'São Bernardo',f:'Ponte Preta',gc:3,gf:0,r:7},{c:'Operário-PR',f:'Londrina',gc:3,gf:0,r:7},{c:'Sport',f:'Ceará',gc:2,gf:0,r:7},{c:'Atlético-GO',f:'Juventude',gc:0,gf:0,r:7},{c:'América-MG',f:'CRB',gc:1,gf:2,r:7},{c:'Avaí',f:'Novorizontino',gc:3,gf:3,r:7},{c:'Vila Nova',f:'Athletic',gc:1,gf:1,r:7},
// R8 (09-10/05/2026)
{c:'Goiás',f:'Vila Nova',gc:1,gf:0,r:8},{c:'Athletic',f:'Cuiabá',gc:0,gf:0,r:8},{c:'Ponte Preta',f:'Sport',gc:1,gf:3,r:8},{c:'Ceará',f:'Atlético-GO',gc:0,gf:1,r:8},{c:'CRB',f:'Operário-PR',gc:3,gf:0,r:8},{c:'Juventude',f:'Criciúma',gc:0,gf:0,r:8},{c:'Náutico',f:'América-MG',gc:4,gf:0,r:8},{c:'Avaí',f:'Fortaleza',gc:0,gf:0,r:8},{c:'Novorizontino',f:'Botafogo-SP',gc:1,gf:0,r:8},{c:'Londrina',f:'São Bernardo',gc:1,gf:3,r:8},
// R9 (16-18/05/2026)
{c:'São Bernardo',f:'América-MG',gc:1,gf:1,r:9},{c:'Operário-PR',f:'Náutico',gc:2,gf:6,r:9},{c:'Goiás',f:'Botafogo-SP',gc:1,gf:0,r:9},{c:'Cuiabá',f:'Novorizontino',gc:0,gf:0,r:9},{c:'Athletic',f:'Juventude',gc:1,gf:1,r:9},{c:'Vila Nova',f:'Avaí',gc:2,gf:0,r:9},{c:'Criciúma',f:'Atlético-GO',gc:1,gf:1,r:9},{c:'Ceará',f:'Fortaleza',gc:2,gf:1,r:9},{c:'Sport',f:'CRB',gc:1,gf:2,r:9},{c:'Ponte Preta',f:'Londrina',gc:1,gf:4,r:9},
// R10 (22-24/05/2026) — fixtures REAIS da CBF (a SB_TAB algorítmica diverge daqui
// p/ frente; ver nota de integridade). São Bernardo lidera (20). Sport vice (22 c/ jogo).
{c:'Náutico',f:'Cuiabá',gc:1,gf:0,r:10},{c:'Novorizontino',f:'Ceará',gc:2,gf:1,r:10},{c:'Fortaleza',f:'Londrina',gc:3,gf:0,r:10},{c:'Juventude',f:'Sport',gc:0,gf:1,r:10},{c:'Atlético-GO',f:'São Bernardo',gc:0,gf:1,r:10},{c:'CRB',f:'Ponte Preta',gc:4,gf:2,r:10},{c:'América-MG',f:'Vila Nova',gc:1,gf:2,r:10},{c:'Avaí',f:'Goiás',gc:0,gf:2,r:10},{c:'Operário-PR',f:'Criciúma',gc:1,gf:1,r:10},{c:'Botafogo-SP',f:'Athletic',gc:1,gf:2,r:10},{c:'Juventude',f:'América-MG',gc:3,gf:0,r:11},{c:'Atlético-GO',f:'Goiás',gc:1,gf:1,r:11},{c:'Avaí',f:'Criciúma',gc:1,gf:2,r:11},{c:'Athletic',f:'Fortaleza',gc:1,gf:0,r:11},{c:'Sport',f:'Náutico',gc:2,gf:0,r:11},{c:'São Bernardo',f:'Novorizontino',gc:1,gf:1,r:11},{c:'Londrina',f:'Vila Nova',gc:0,gf:1,r:11},{c:'Ceará',f:'Operário-PR',gc:1,gf:2,r:11},{c:'Cuiabá',f:'CRB',gc:2,gf:0,r:11},{c:'Ponte Preta',f:'Botafogo-SP',gc:0,gf:0,r:11},{c:'Operário-PR',f:'Juventude',gc:2,gf:1,r:12},{c:'Criciúma',f:'Londrina',gc:1,gf:0,r:12},{c:'CRB',f:'São Bernardo',gc:2,gf:3,r:12}];
const SB_META={key:'B',nR:38,nReb:4,zonas:{g4:2,g4L:'Acesso (G2)',g6:6,g6L:'Playoff (3-6)',z4:17}};

// === SÉRIE C ===
const SC_DATES=['05/04','12/04','19/04','26/04','03/05','10/05','17/05','24/05','31/05','07/06','14/06','21/06','28/06','05/07','12/07','19/07','26/07','09/08','16/08'];
const SC_RANKING={'Ferroviária':{elo:1310},'Amazonas':{elo:1310},'Volta Redonda':{elo:1310},'Paysandu':{elo:1310},'Caxias':{elo:1306},'Brusque':{elo:1302},'Guarani':{elo:1302},'Floresta':{elo:1302},'Confiança':{elo:1296},'Ypiranga':{elo:1296},'Maringá':{elo:1296},'Ituano':{elo:1296},'Botafogo-PB':{elo:1296},'Figueirense':{elo:1296},'Anápolis':{elo:1296},'Itabaiana':{elo:1296},'Inter de Limeira':{elo:1280},'Barra':{elo:1280},'Maranhão':{elo:1280},'Santa Cruz':{elo:1280}};
const SC_NM={'AMA':'Amazonas','ANA':'Anápolis','BAR':'Barra','BPB':'Botafogo-PB','BRQ':'Brusque','CAX':'Caxias','CON':'Confiança','FER':'Ferroviária','FIG':'Figueirense','FLR':'Floresta','GUA':'Guarani','IDL':'Inter de Limeira','ITB':'Itabaiana','ITU':'Ituano','MAR':'Maringá','MRA':'Maranhão','PAY':'Paysandu','SCR':'Santa Cruz','VRD':'Volta Redonda','YPI':'Ypiranga'};
const SC_TAB=['IDL-FLR,ITU-ANA,BRQ-CAX,CON-AMA,MRA-GUA,VRD-PAY,MAR-FER,YPI-FIG,SCR-ITB,BPB-BAR','FER-BPB,GUA-VRD,FIG-MAR,ITB-YPI,FLR-SCR,ANA-IDL,CAX-CON,BAR-MRA,PAY-BRQ,AMA-ITU','IDL-ITU,GUA-ITB,FIG-BPB,CON-SCR,FLR-FER,VRD-CAX,MAR-BRQ,YPI-ANA,PAY-BAR,AMA-MRA','FER-GUA,ITU-MAR,BRQ-CON,ITB-PAY,MRA-VRD,ANA-FIG,CAX-YPI,BAR-IDL,SCR-AMA,BPB-FLR','FER-ANA,GUA-SCR,FIG-BAR,CON-IDL,FLR-MRA,VRD-BRQ,MAR-ITB,YPI-ITU,PAY-BPB,AMA-CAX','IDL-SCR,ITU-CON,BRQ-YPI,ITB-FLR,MRA-BPB,VRD-FER,MAR-GUA,BAR-CAX,PAY-ANA,AMA-FIG','FER-BRQ,GUA-ITU,FIG-ITB,CON-MRA,FLR-AMA,ANA-BAR,CAX-PAY,YPI-MAR,SCR-VRD,BPB-IDL','IDL-ITB,ITU-BPB,BRQ-ANA,CON-FIG,MRA-CAX,VRD-YPI,MAR-SCR,BAR-GUA,PAY-FLR,AMA-FER','IDL-YPI,GUA-AMA,FIG-PAY,ITB-VRD,FLR-CON,ANA-MRA,CAX-ITU,BAR-BRQ,SCR-FER,BPB-MAR','FER-BAR,GUA-CAX,BRQ-SCR,ITB-ITU,FLR-FIG,VRD-CON,MAR-MRA,YPI-BPB,PAY-IDL,AMA-ANA','FER-IDL,ITU-FIG,BRQ-FLR,CON-GUA,MRA-PAY,ANA-ITB,CAX-MAR,BAR-AMA,SCR-YPI,BPB-VRD','IDL-MAR,ITU-MRA,FIG-GUA,ITB-FER,FLR-BAR,VRD-AMA,CAX-ANA,YPI-CON,PAY-SCR,BPB-BRQ','FER-CAX,GUA-FLR,BRQ-FIG,CON-BAR,MRA-IDL,ANA-BPB,MAR-VRD,YPI-PAY,SCR-ITU,AMA-ITB','IDL-AMA,ITU-FER,FIG-VRD,ITB-BRQ,MRA-YPI,ANA-MAR,CAX-FLR,BAR-SCR,PAY-GUA,BPB-CON','FER-MRA,GUA-IDL,BRQ-ITU,CON-ITB,FLR-MAR,VRD-ANA,CAX-BPB,YPI-BAR,SCR-FIG,AMA-PAY','IDL-VRD,ITU-BAR,FIG-FER,ITB-CAX,MRA-BRQ,ANA-GUA,MAR-AMA,YPI-FLR,PAY-CON,BPB-SCR','FER-PAY,GUA-YPI,BRQ-IDL,CON-MAR,FLR-ANA,VRD-ITU,CAX-FIG,BAR-ITB,SCR-MRA,AMA-BPB','IDL-FIG,ITU-PAY,BRQ-AMA,CON-ANA,MRA-ITB,VRD-FLR,MAR-BAR,YPI-FER,SCR-CAX,BPB-GUA','FER-CON,GUA-BRQ,FIG-MRA,ITB-BPB,FLR-ITU,ANA-SCR,CAX-IDL,BAR-VRD,PAY-MAR,AMA-YPI'];
const SC_RES=[{c:'Maranhão',f:'Guarani',gc:1,gf:1,r:1},{c:'Brusque',f:'Caxias',gc:2,gf:1,r:1},{c:'Maringá',f:'Ferroviária',gc:3,gf:2,r:1},{c:'Botafogo-PB',f:'Barra',gc:1,gf:0,r:1},{c:'Inter de Limeira',f:'Floresta',gc:1,gf:2,r:1},{c:'Ituano',f:'Anápolis',gc:2,gf:0,r:1},{c:'Confiança',f:'Amazonas',gc:0,gf:1,r:1},{c:'Volta Redonda',f:'Paysandu',gc:0,gf:1,r:1},{c:'Ypiranga',f:'Figueirense',gc:1,gf:1,r:1},{c:'Santa Cruz',f:'Itabaiana',gc:1,gf:0,r:1},{c:'Floresta',f:'Santa Cruz',gc:1,gf:1,r:2},{c:'Ferroviária',f:'Botafogo-PB',gc:0,gf:2,r:2},{c:'Barra',f:'Maranhão',gc:3,gf:0,r:2},{c:'Anápolis',f:'Inter de Limeira',gc:1,gf:2,r:2},{c:'Caxias',f:'Confiança',gc:1,gf:0,r:2},{c:'Paysandu',f:'Brusque',gc:1,gf:1,r:2},{c:'Guarani',f:'Volta Redonda',gc:2,gf:0,r:2},{c:'Itabaiana',f:'Ypiranga',gc:1,gf:2,r:2},{c:'Amazonas',f:'Ituano',gc:3,gf:0,r:2},{c:'Figueirense',f:'Maringá',gc:1,gf:3,r:2},{c:'Inter de Limeira',f:'Ituano',gc:1,gf:1,r:3},{c:'Guarani',f:'Itabaiana',gc:1,gf:1,r:3},{c:'Figueirense',f:'Botafogo-PB',gc:2,gf:1,r:3},{c:'Confiança',f:'Santa Cruz',gc:1,gf:0,r:3},{c:'Floresta',f:'Ferroviária',gc:0,gf:0,r:3},{c:'Volta Redonda',f:'Caxias',gc:1,gf:0,r:3},{c:'Maringá',f:'Brusque',gc:2,gf:3,r:3},{c:'Ypiranga',f:'Anápolis',gc:3,gf:0,r:3},{c:'Paysandu',f:'Barra',gc:1,gf:1,r:3},{c:'Amazonas',f:'Maranhão',gc:2,gf:0,r:3},{c:'Itabaiana',f:'Paysandu',gc:1,gf:4,r:4},{c:'Brusque',f:'Confiança',gc:2,gf:1,r:4},{c:'Botafogo-PB',f:'Floresta',gc:1,gf:2,r:4},{c:'Maranhão',f:'Volta Redonda',gc:2,gf:1,r:4},{c:'Anápolis',f:'Figueirense',gc:3,gf:1,r:4},{c:'Barra',f:'Inter de Limeira',gc:2,gf:2,r:4},{c:'Santa Cruz',f:'Amazonas',gc:0,gf:1,r:4},{c:'Ituano',f:'Maringá',gc:4,gf:1,r:4},{c:'Ferroviária',f:'Guarani',gc:2,gf:2,r:4},{c:'Caxias',f:'Ypiranga',gc:2,gf:1,r:4},
// R5 (02-04/05/2026)
{c:'Ferroviária',f:'Anápolis',gc:1,gf:0,r:5},{c:'Guarani',f:'Santa Cruz',gc:1,gf:0,r:5},{c:'Figueirense',f:'Barra',gc:0,gf:3,r:5},{c:'Confiança',f:'Inter de Limeira',gc:0,gf:1,r:5},{c:'Floresta',f:'Maranhão',gc:1,gf:2,r:5},{c:'Volta Redonda',f:'Brusque',gc:1,gf:1,r:5},{c:'Maringá',f:'Itabaiana',gc:4,gf:2,r:5},{c:'Ypiranga',f:'Ituano',gc:2,gf:0,r:5},{c:'Paysandu',f:'Botafogo-PB',gc:4,gf:2,r:5},{c:'Amazonas',f:'Caxias',gc:1,gf:1,r:5},
// R6 (09-11/05/2026)
{c:'Inter de Limeira',f:'Santa Cruz',gc:1,gf:2,r:6},{c:'Ituano',f:'Confiança',gc:1,gf:0,r:6},{c:'Brusque',f:'Ypiranga',gc:3,gf:0,r:6},{c:'Itabaiana',f:'Floresta',gc:0,gf:0,r:6},{c:'Maranhão',f:'Botafogo-PB',gc:3,gf:1,r:6},{c:'Volta Redonda',f:'Ferroviária',gc:0,gf:0,r:6},{c:'Maringá',f:'Guarani',gc:0,gf:5,r:6},{c:'Barra',f:'Caxias',gc:0,gf:0,r:6},{c:'Paysandu',f:'Anápolis',gc:2,gf:1,r:6},{c:'Amazonas',f:'Figueirense',gc:0,gf:1,r:6},
// R7 (16-18/05/2026)
{c:'Ferroviária',f:'Brusque',gc:1,gf:0,r:7},{c:'Guarani',f:'Ituano',gc:1,gf:3,r:7},{c:'Figueirense',f:'Itabaiana',gc:0,gf:1,r:7},{c:'Confiança',f:'Maranhão',gc:2,gf:1,r:7},{c:'Floresta',f:'Amazonas',gc:3,gf:2,r:7},{c:'Anápolis',f:'Barra',gc:1,gf:1,r:7},{c:'Caxias',f:'Paysandu',gc:2,gf:0,r:7},{c:'Ypiranga',f:'Maringá',gc:1,gf:4,r:7},{c:'Santa Cruz',f:'Volta Redonda',gc:2,gf:0,r:7},{c:'Botafogo-PB',f:'Inter de Limeira',gc:0,gf:1,r:7},
// R8 (23-26/05/2026) — 8 placares derivados por delta de saldo (consistência+pontos
// validados) + CON-FIG, MAR-SCR e AMA-FER/ITU-BPB confirmados por reportagem.
{c:'Inter de Limeira',f:'Itabaiana',gc:0,gf:0,r:8},{c:'Ituano',f:'Botafogo-PB',gc:1,gf:0,r:8},{c:'Brusque',f:'Anápolis',gc:1,gf:0,r:8},{c:'Confiança',f:'Figueirense',gc:0,gf:0,r:8},{c:'Maranhão',f:'Caxias',gc:0,gf:0,r:8},{c:'Volta Redonda',f:'Ypiranga',gc:2,gf:1,r:8},{c:'Maringá',f:'Santa Cruz',gc:1,gf:1,r:8},{c:'Barra',f:'Guarani',gc:0,gf:2,r:8},{c:'Paysandu',f:'Floresta',gc:2,gf:1,r:8},{c:'Amazonas',f:'Ferroviária',gc:1,gf:2,r:8},{c:'Itabaiana',f:'Volta Redonda',gc:0,gf:1,r:9},{c:'Floresta',f:'Confiança',gc:1,gf:0,r:9},{c:'Botafogo-PB',f:'Maringá',gc:2,gf:1,r:9},{c:'Caxias',f:'Ituano',gc:2,gf:1,r:9},{c:'Inter de Limeira',f:'Ypiranga',gc:2,gf:1,r:9},{c:'Guarani',f:'Amazonas',gc:5,gf:0,r:9},{c:'Santa Cruz',f:'Ferroviária',gc:1,gf:1,r:9},{c:'Anápolis',f:'Maranhão',gc:0,gf:0,r:9},{c:'Figueirense',f:'Paysandu',gc:2,gf:1,r:9},{c:'Barra',f:'Brusque',gc:2,gf:2,r:9}];const SC_META={key:'C',nR:19,nReb:2,zonas:{g4:8,g4L:'Quadrangular (G8)',z4:19}};

// === SÉRIE D ===
const SD_UF={PE:1235,SC:1234,SE:1233,DF:1231,PB:1229,PR:1229,RN:1228,MT:1226,RS:1223,SP:1220,ES:1213,RJ:1213,BA:1211,CE:1208,GO:1208,AL:1207,MA:1198,MG:1198,PI:1192,PA:1191,MS:1177,TO:1176,AM:1169,RO:1163,RR:1136,AP:1128,AC:1125};
const SD_ADJ={rebaixado_c:45,retorno_d_avancou:40,estadual:0,ranking_nacional:0};
const SD_TD=[{n:'CSA',u:'AL',o:'rebaixado_c'},{n:'Tombense',u:'MG',o:'rebaixado_c'},{n:'ABC',u:'RN',o:'rebaixado_c'},{n:'Retrô',u:'PE',o:'rebaixado_c'},{n:'Ferroviário',u:'CE',o:'estadual'},{n:'América-RN',u:'RN',o:'estadual'},{n:'Manaus',u:'AM',o:'estadual'},{n:'Águia de Marabá',u:'PA',o:'estadual'},{n:'Brasil-RS',u:'RS',o:'estadual'},{n:'Sousa',u:'PB',o:'estadual'},{n:'Tocantinópolis',u:'TO',o:'estadual'},{n:'ASA',u:'AL',o:'estadual'},{n:'Porto Velho',u:'RO',o:'estadual'},{n:'Trem',u:'AP',o:'estadual'},{n:'Sergipe',u:'SE',o:'estadual'},{n:'Tuna Luso',u:'PA',o:'estadual'},{n:'Maracanã',u:'CE',o:'estadual'},{n:'Cianorte',u:'PR',o:'estadual'},{n:'Operário-MS',u:'MS',o:'estadual'},{n:'Jacuipense',u:'BA',o:'estadual'},{n:'Capital',u:'DF',o:'estadual'},{n:'Fluminense-PI',u:'PI',o:'estadual'},{n:'São Luiz-RS',u:'RS',o:'estadual'},{n:'Azuriz',u:'PR',o:'estadual'},{n:'Rio Branco-ES',u:'ES',o:'estadual'},{n:'GAS',u:'RR',o:'estadual'},{n:'Guarany de Bagé',u:'RS',o:'estadual'},{n:'Mixto',u:'MT',o:'estadual'},{n:'Portuguesa-SP',u:'SP',o:'estadual'},{n:'Atlético-BA',u:'BA',o:'estadual'},{n:'Lagarto',u:'SE',o:'estadual'},{n:'CSE',u:'AL',o:'estadual'},{n:'Independência',u:'AC',o:'estadual'},{n:'Joinville',u:'SC',o:'estadual'},{n:'CRAC',u:'GO',o:'estadual'},{n:'Uberlândia',u:'MG',o:'estadual'},{n:'Imperatriz',u:'MA',o:'estadual'},{n:'Democrata GV',u:'MG',o:'estadual'},{n:'Vitória-ES',u:'ES',o:'estadual'},{n:'Nacional-AM',u:'AM',o:'estadual'},{n:'XV de Piracicaba',u:'SP',o:'estadual'},{n:'São Joseense',u:'PR',o:'estadual'},{n:'Oratório',u:'AP',o:'estadual'},{n:'Madureira',u:'RJ',o:'estadual'},{n:'Gama',u:'DF',o:'estadual'},{n:'Galvez',u:'AC',o:'estadual'},{n:'Noroeste',u:'SP',o:'estadual'},{n:'Velo Clube',u:'SP',o:'estadual'},{n:'Sampaio Corrêa-RJ',u:'RJ',o:'estadual'},{n:'Betim',u:'MG',o:'estadual'},{n:'Tirol',u:'CE',o:'estadual'},{n:'ABECAT',u:'GO',o:'estadual'},{n:'Inhumas',u:'GO',o:'estadual'},{n:'Porto',u:'BA',o:'estadual'},{n:'Santa Catarina',u:'SC',o:'estadual'},{n:'Decisão',u:'PE',o:'estadual'},{n:'Maguary',u:'PE',o:'estadual'},{n:'Primavera',u:'MT',o:'estadual'},{n:'Serra Branca',u:'PB',o:'estadual'},{n:'IAPE',u:'MA',o:'estadual'},{n:'Piauí',u:'PI',o:'estadual'},{n:'Guaporé',u:'RO',o:'estadual'},{n:'Monte Roraima',u:'RR',o:'estadual'},{n:'Ivinhema',u:'MS',o:'estadual'},{n:'Laguna',u:'RN',o:'estadual'},{n:'America-RJ',u:'RJ',o:'estadual'},{n:'Araguaína',u:'TO',o:'estadual'},{n:'Blumenau',u:'SC',o:'estadual'},{n:'Sampaio Corrêa',u:'MA',o:'retorno_d_avancou'},{n:'Aparecidense',u:'GO',o:'retorno_d_avancou'},{n:'São José-RS',u:'RS',o:'retorno_d_avancou'},{n:'Altos',u:'PI',o:'retorno_d_avancou'},{n:'FC Cascavel',u:'PR',o:'retorno_d_avancou'},{n:'Ceilândia',u:'DF',o:'retorno_d_avancou'},{n:'Juazeirense',u:'BA',o:'retorno_d_avancou'},{n:'Manauara',u:'AM',o:'retorno_d_avancou'},{n:'Água Santa',u:'SP',o:'retorno_d_avancou'},{n:'Marcílio Dias',u:'SC',o:'retorno_d_avancou'},{n:'Central',u:'PE',o:'retorno_d_avancou'},{n:'Goiatuba',u:'GO',o:'retorno_d_avancou'},{n:'Luverdense',u:'MT',o:'retorno_d_avancou'},{n:'Maricá',u:'RJ',o:'retorno_d_avancou'},{n:'Nova Iguaçu',u:'RJ',o:'ranking_nacional'},{n:'Brasiliense',u:'DF',o:'ranking_nacional'},{n:'Pouso Alegre',u:'MG',o:'ranking_nacional'},{n:'Portuguesa-RJ',u:'RJ',o:'ranking_nacional'},{n:'Humaitá',u:'AC',o:'ranking_nacional'},{n:'São Raimundo-RR',u:'RR',o:'ranking_nacional'},{n:'Iguatu',u:'CE',o:'ranking_nacional'},{n:'União-MT',u:'MT',o:'ranking_nacional'},{n:'Real Noroeste',u:'ES',o:'ranking_nacional'},{n:'Treze',u:'PB',o:'ranking_nacional'},{n:'Atlético-CE',u:'CE',o:'ranking_nacional'},{n:'Operário-MT',u:'MT',o:'ranking_nacional'},{n:'Moto Club',u:'MA',o:'ranking_nacional'},{n:'Parnahyba',u:'PI',o:'ranking_nacional'}];
const SD_OVR={'ABECAT':1225,'CRAC':1210,'Goiatuba':1205,'Aparecidense':1200,'Inhumas':1195,'Pouso Alegre':1215,'Tombense':1200,'Uberlândia':1200,'Betim':1185,'Democrata GV':1185,'Retrô':1250,'Decisão':1230,'Maguary':1225,'Azuriz':1240,'Cianorte':1235,'São Joseense':1230,'FC Cascavel':1210,'Madureira':1235,'Nova Iguaçu':1215,'Portuguesa-RJ':1215,'Maricá':1205,'Sampaio Corrêa-RJ':1205,'São José-RS':1235,'São Luiz-RS':1225,'Guarany de Bagé':1210,'Santa Catarina':1245,'Marcílio Dias':1230,'Joinville':1225,'Água Santa':1240,'Portuguesa-SP':1255,'Velo Clube':1210,'Sampaio Corrêa':1211,'Altos':1205,'Ceilândia':1244,'Juazeirense':1224,'Manauara':1182,'Central':1248,'Luverdense':1239};
const SD_INFO={};SD_TD.forEach(t=>{SD_INFO[t.n]={uf:t.u,origem:t.o,elo:SD_OVR[t.n]||(SD_UF[t.u]+(SD_ADJ[t.o]||0))};});
Object.keys(SD_INFO).forEach(t=>{if(!UF_MAP[t])UF_MAP[t]=SD_INFO[t].uf;});
const SD_TIMES=SD_TD.map(t=>t.n);
const SD_GRUPOS=[['Nacional-AM','Manaus','Manauara','GAS','Monte Roraima','São Raimundo-RR'],['Independência','Galvez','Humaitá','Porto Velho','Guaporé','Araguaína'],['Gama','Brasiliense','Luverdense','Primavera','Inhumas','Aparecidense'],['Capital','Ceilândia','Mixto','Operário-MT','União-MT','Goiatuba'],['Trem','Oratório','Tuna Luso','Águia de Marabá','Tocantinópolis','Imperatriz'],['Sampaio Corrêa','Moto Club','IAPE','Maracanã','Iguatu','Parnahyba'],['Ferroviário','Tirol','Atlético-CE','Altos','Piauí','Fluminense-PI'],['ABC','América-RN','Laguna','Sousa','Maguary','Central'],['Retrô','Decisão','Serra Branca','Treze','Lagarto','Sergipe'],['ASA','CSA','CSE','Jacuipense','Atlético-BA','Juazeirense'],['Uberlândia','Betim','CRAC','ABECAT','Operário-MS','Ivinhema'],['Porto','Rio Branco-ES','Vitória-ES','Real Noroeste','Tombense','Democrata GV'],['Madureira','Portuguesa-RJ','America-RJ','Portuguesa-SP','Água Santa','Pouso Alegre'],['Nova Iguaçu','Sampaio Corrêa-RJ','Maricá','XV de Piracicaba','Noroeste','Velo Clube'],['Cianorte','FC Cascavel','Santa Catarina','Joinville','Guarany de Bagé','São Luiz-RS'],['Blumenau','Marcílio Dias','São Joseense','Azuriz','São José-RS','Brasil-RS']];
const SD_GL=['A1·AM+RR','A2·AC+RO+TO','A3·DF+MT+GO','A4·DF+MT+GO','A5·AP+PA+TO+MA','A6·MA+CE+PI','A7·CE+PI','A8·RN+PB+PE','A9·PE+PB+SE','A10·AL+BA','A11·MG+GO+MS','A12·BA+ES+MG','A13·RJ+SP+MG','A14·RJ+SP','A15·PR+SC+RS','A16·SC+PR+RS'];
const SD_PAIRS=[[0,1],[2,3],[4,5],[6,7],[8,9],[10,11],[12,13],[14,15]];
const SD_SUPER=[[0,1],[2,3],[4,5],[6,7]];
// Adiciona índice do grupo (0..15) a SD_INFO para exposição em tabelas/filtros
SD_GRUPOS.forEach((g,gi)=>g.forEach(t=>{if(SD_INFO[t])SD_INFO[t].grupo=gi;}));
// Datas CBF Série D 2026

// Resultados reais Série D
const SD_RES=[
// R1 (04-05/04)
{c:'Manaus',f:'GAS',gc:1,gf:0,r:1},{c:'Monte Roraima',f:'Nacional-AM',gc:0,gf:1,r:1},{c:'São Raimundo-RR',f:'Manauara',gc:0,gf:0,r:1},
{c:'Guaporé',f:'Independência',gc:1,gf:0,r:1},{c:'Galvez',f:'Araguaína',gc:1,gf:2,r:1},{c:'Humaitá',f:'Porto Velho',gc:1,gf:5,r:1},
{c:'Aparecidense',f:'Gama',gc:0,gf:2,r:1},{c:'Inhumas',f:'Luverdense',gc:1,gf:2,r:1},{c:'Brasiliense',f:'Primavera',gc:1,gf:1,r:1},
{c:'União-MT',f:'Capital',gc:0,gf:1,r:1},{c:'Ceilândia',f:'Mixto',gc:0,gf:0,r:1},{c:'Operário-MT',f:'Goiatuba',gc:2,gf:2,r:1},
{c:'Águia de Marabá',f:'Trem',gc:1,gf:1,r:1},{c:'Tuna Luso',f:'Imperatriz',gc:0,gf:0,r:1},
{c:'IAPE',f:'Maracanã',gc:2,gf:2,r:1},{c:'Iguatu',f:'Sampaio Corrêa',gc:0,gf:0,r:1},{c:'Moto Club',f:'Parnahyba',gc:1,gf:1,r:1},
{c:'Fluminense-PI',f:'Ferroviário',gc:1,gf:1,r:1},{c:'Tirol',f:'Piauí',gc:1,gf:2,r:1},{c:'Atlético-CE',f:'Altos',gc:0,gf:0,r:1},
{c:'Maguary',f:'ABC',gc:3,gf:0,r:1},{c:'América-RN',f:'Sousa',gc:2,gf:0,r:1},{c:'Laguna',f:'Central',gc:1,gf:1,r:1},
{c:'Treze',f:'Retrô',gc:3,gf:0,r:1},{c:'Decisão',f:'Lagarto',gc:1,gf:1,r:1},{c:'Serra Branca',f:'Sergipe',gc:1,gf:1,r:1},
{c:'Juazeirense',f:'CSE',gc:3,gf:1,r:1},{c:'ASA',f:'Jacuipense',gc:0,gf:0,r:1},{c:'CSA',f:'Atlético-BA',gc:3,gf:0,r:1},
{c:'ABECAT',f:'Uberlândia',gc:0,gf:1,r:1},{c:'Operário-MS',f:'Betim',gc:1,gf:1,r:1},{c:'Ivinhema',f:'CRAC',gc:1,gf:0,r:1},
{c:'Vitória-ES',f:'Tombense',gc:0,gf:1,r:1},{c:'Porto',f:'Rio Branco-ES',gc:3,gf:2,r:1},
{c:'Água Santa',f:'America-RJ',gc:4,gf:0,r:1},{c:'Pouso Alegre',f:'Madureira',gc:2,gf:0,r:1},{c:'Portuguesa-RJ',f:'Portuguesa-SP',gc:1,gf:1,r:1},
{c:'Maricá',f:'Velo Clube',gc:2,gf:1,r:1},{c:'XV de Piracicaba',f:'Nova Iguaçu',gc:4,gf:1,r:1},{c:'Sampaio Corrêa-RJ',f:'Noroeste',gc:1,gf:0,r:1},
{c:'Joinville',f:'São Luiz-RS',gc:2,gf:0,r:1},{c:'FC Cascavel',f:'Santa Catarina',gc:1,gf:0,r:1},{c:'Cianorte',f:'Guarany de Bagé',gc:3,gf:1,r:1},
{c:'São José-RS',f:'Blumenau',gc:0,gf:3,r:1},{c:'Brasil-RS',f:'Azuriz',gc:2,gf:1,r:1},{c:'Marcílio Dias',f:'São Joseense',gc:0,gf:0,r:1},
{c:'Manauara',f:'Monte Roraima',gc:2,gf:0,r:2},{c:'Nacional-AM',f:'Manaus',gc:2,gf:0,r:2},{c:'GAS',f:'São Raimundo-RR',gc:0,gf:2,r:2},
{c:'Independência',f:'Humaitá',gc:3,gf:0,r:2},{c:'Araguaína',f:'Guaporé',gc:1,gf:1,r:2},{c:'Porto Velho',f:'Galvez',gc:4,gf:0,r:2},
{c:'Gama',f:'Inhumas',gc:2,gf:0,r:2},{c:'Primavera',f:'Aparecidense',gc:1,gf:3,r:2},{c:'Luverdense',f:'Brasiliense',gc:0,gf:0,r:2},
{c:'Capital',f:'Operário-MT',gc:1,gf:0,r:2},{c:'Mixto',f:'União-MT',gc:2,gf:2,r:2},{c:'Goiatuba',f:'Ceilândia',gc:1,gf:0,r:2},
{c:'Tocantinópolis',f:'Águia de Marabá',gc:2,gf:2,r:2},{c:'Trem',f:'Tuna Luso',gc:3,gf:3,r:2},{c:'Imperatriz',f:'Oratório',gc:3,gf:1,r:2},
{c:'Maracanã',f:'Moto Club',gc:2,gf:0,r:2},{c:'Sampaio Corrêa',f:'IAPE',gc:0,gf:0,r:2},{c:'Parnahyba',f:'Iguatu',gc:0,gf:2,r:2},
{c:'Ferroviário',f:'Tirol',gc:3,gf:2,r:2},{c:'Piauí',f:'Atlético-CE',gc:1,gf:1,r:2},{c:'Altos',f:'Fluminense-PI',gc:0,gf:3,r:2},
{c:'ABC',f:'Laguna',gc:4,gf:0,r:2},{c:'Sousa',f:'Maguary',gc:1,gf:0,r:2},
{c:'Retrô',f:'Serra Branca',gc:2,gf:2,r:2},{c:'Lagarto',f:'Treze',gc:5,gf:4,r:2},{c:'Sergipe',f:'Decisão',gc:2,gf:1,r:2},
{c:'Jacuipense',f:'CSA',gc:1,gf:3,r:2},
{c:'Betim',f:'ABECAT',gc:1,gf:0,r:2},{c:'Uberlândia',f:'Ivinhema',gc:1,gf:2,r:2},
{c:'Real Noroeste',f:'Vitória-ES',gc:1,gf:3,r:2},{c:'Tombense',f:'Porto',gc:3,gf:0,r:2},{c:'Rio Branco-ES',f:'Democrata GV',gc:1,gf:1,r:2},
{c:'America-RJ',f:'Portuguesa-RJ',gc:0,gf:4,r:2},{c:'Portuguesa-SP',f:'Pouso Alegre',gc:3,gf:0,r:2},{c:'Madureira',f:'Água Santa',gc:3,gf:1,r:2},
{c:'Velo Clube',f:'Sampaio Corrêa-RJ',gc:2,gf:0,r:2},{c:'Nova Iguaçu',f:'Maricá',gc:0,gf:1,r:2},{c:'Noroeste',f:'XV de Piracicaba',gc:2,gf:2,r:2},
{c:'São Luiz-RS',f:'FC Cascavel',gc:0,gf:0,r:2},{c:'Santa Catarina',f:'Cianorte',gc:1,gf:0,r:2},{c:'Guarany de Bagé',f:'Joinville',gc:0,gf:0,r:2},
{c:'Blumenau',f:'Brasil-RS',gc:3,gf:2,r:2},{c:'Azuriz',f:'Marcílio Dias',gc:0,gf:0,r:2},{c:'São Joseense',f:'São José-RS',gc:1,gf:0,r:2},{c:'Atlético-BA',f:'Juazeirense',gc:1,gf:2,r:2},{c:'CSE',f:'ASA',gc:1,gf:2,r:2},{c:'CRAC',f:'Operário-MS',gc:0,gf:0,r:2},{c:'Central',f:'América-RN',gc:0,gf:1,r:2},
// R1 jogos adiados — disputados em 06/04 (Democrata) e 22/04 (Oratório)
{c:'Democrata GV',f:'Real Noroeste',gc:1,gf:0,r:1},{c:'Oratório',f:'Tocantinópolis',gc:3,gf:0,r:1},
// R3 (18-22/04) — 1 jogo do A6 (Moto Club×Sampaio Corrêa) adiado por chuva
{c:'São Raimundo-RR',f:'Monte Roraima',gc:1,gf:1,r:3},{c:'Manaus',f:'Manauara',gc:1,gf:1,r:3},{c:'Nacional-AM',f:'GAS',gc:3,gf:2,r:3},
{c:'Guaporé',f:'Humaitá',gc:3,gf:1,r:3},{c:'Porto Velho',f:'Araguaína',gc:1,gf:2,r:3},{c:'Galvez',f:'Independência',gc:2,gf:1,r:3},
{c:'Inhumas',f:'Brasiliense',gc:0,gf:1,r:3},{c:'Primavera',f:'Gama',gc:0,gf:1,r:3},{c:'Aparecidense',f:'Luverdense',gc:0,gf:1,r:3},
{c:'Capital',f:'Goiatuba',gc:0,gf:1,r:3},{c:'Operário-MT',f:'Mixto',gc:0,gf:1,r:3},{c:'Ceilândia',f:'União-MT',gc:1,gf:0,r:3},
{c:'Tocantinópolis',f:'Trem',gc:0,gf:1,r:3},{c:'Tuna Luso',f:'Oratório',gc:2,gf:0,r:3},{c:'Águia de Marabá',f:'Imperatriz',gc:1,gf:1,r:3},
{c:'Iguatu',f:'IAPE',gc:3,gf:2,r:3},{c:'Maracanã',f:'Parnahyba',gc:1,gf:0,r:3},
{c:'Altos',f:'Ferroviário',gc:1,gf:0,r:3},{c:'Tirol',f:'Atlético-CE',gc:0,gf:0,r:3},{c:'Fluminense-PI',f:'Piauí',gc:3,gf:2,r:3},
{c:'Maguary',f:'Laguna',gc:2,gf:0,r:3},{c:'Central',f:'Sousa',gc:2,gf:1,r:3},{c:'América-RN',f:'ABC',gc:1,gf:2,r:3},
{c:'Lagarto',f:'Retrô',gc:1,gf:2,r:3},{c:'Treze',f:'Sergipe',gc:3,gf:1,r:3},{c:'Serra Branca',f:'Decisão',gc:3,gf:0,r:3},
{c:'Juazeirense',f:'Jacuipense',gc:3,gf:1,r:3},{c:'ASA',f:'CSA',gc:2,gf:1,r:3},{c:'Atlético-BA',f:'CSE',gc:1,gf:2,r:3},
{c:'Uberlândia',f:'CRAC',gc:2,gf:1,r:3},{c:'Operário-MS',f:'ABECAT',gc:1,gf:1,r:3},{c:'Ivinhema',f:'Betim',gc:1,gf:3,r:3},
{c:'Real Noroeste',f:'Tombense',gc:0,gf:0,r:3},{c:'Vitória-ES',f:'Rio Branco-ES',gc:1,gf:2,r:3},{c:'Porto',f:'Democrata GV',gc:1,gf:0,r:3},
{c:'America-RJ',f:'Portuguesa-SP',gc:1,gf:1,r:3},{c:'Pouso Alegre',f:'Água Santa',gc:0,gf:2,r:3},{c:'Portuguesa-RJ',f:'Madureira',gc:0,gf:0,r:3},
{c:'XV de Piracicaba',f:'Velo Clube',gc:1,gf:1,r:3},{c:'Maricá',f:'Sampaio Corrêa-RJ',gc:2,gf:2,r:3},{c:'Noroeste',f:'Nova Iguaçu',gc:1,gf:1,r:3},
{c:'São Luiz-RS',f:'Santa Catarina',gc:4,gf:4,r:3},{c:'Cianorte',f:'Joinville',gc:1,gf:2,r:3},{c:'FC Cascavel',f:'Guarany de Bagé',gc:2,gf:0,r:3},
{c:'Blumenau',f:'Azuriz',gc:1,gf:0,r:3},{c:'Marcílio Dias',f:'São José-RS',gc:2,gf:1,r:3},{c:'Brasil-RS',f:'São Joseense',gc:2,gf:0,r:3},
// R4 (25/04) — 28 jogos do sábado
{c:'Manauara',f:'Nacional-AM',gc:4,gf:2,r:4},
{c:'Manaus',f:'São Raimundo-RR',gc:0,gf:1,r:4},
{c:'Guaporé',f:'Porto Velho',gc:1,gf:0,r:4},
{c:'Aparecidense',f:'Inhumas',gc:3,gf:1,r:4},
{c:'Luverdense',f:'Primavera',gc:1,gf:1,r:4},
{c:'Ceilândia',f:'Capital',gc:1,gf:2,r:4},
{c:'Goiatuba',f:'Mixto',gc:1,gf:0,r:4},
{c:'Águia de Marabá',f:'Tuna Luso',gc:2,gf:0,r:4},
{c:'Imperatriz',f:'Tocantinópolis',gc:1,gf:1,r:4},
{c:'Iguatu',f:'Maracanã',gc:1,gf:0,r:4},
{c:'IAPE',f:'Moto Club',gc:0,gf:2,r:4},
{c:'Fluminense-PI',f:'Tirol',gc:0,gf:0,r:4},
{c:'Sousa',f:'ABC',gc:0,gf:1,r:4},
{c:'Sergipe',f:'Lagarto',gc:3,gf:1,r:4},
{c:'Treze',f:'Serra Branca',gc:1,gf:1,r:4},
{c:'CSA',f:'CSE',gc:1,gf:1,r:4},
{c:'ABECAT',f:'CRAC',gc:0,gf:2,r:4},
{c:'Betim',f:'Uberlândia',gc:0,gf:2,r:4},
{c:'Vitória-ES',f:'Porto',gc:3,gf:0,r:4},
{c:'Democrata GV',f:'Tombense',gc:1,gf:0,r:4},
{c:'Madureira',f:'America-RJ',gc:2,gf:3,r:4},
{c:'Água Santa',f:'Portuguesa-SP',gc:0,gf:1,r:4},
{c:'Velo Clube',f:'Noroeste',gc:1,gf:0,r:4},
{c:'XV de Piracicaba',f:'Maricá',gc:1,gf:0,r:4},
{c:'Sampaio Corrêa-RJ',f:'Nova Iguaçu',gc:1,gf:0,r:4},
{c:'Joinville',f:'Santa Catarina',gc:2,gf:1,r:4},
{c:'Marcílio Dias',f:'Blumenau',gc:0,gf:1,r:4},
{c:'São José-RS',f:'Brasil-RS',gc:0,gf:0,r:4},
// R4 domingo (26/04) — jogos confirmados
{c:'Brasiliense',f:'Gama',gc:1,gf:1,r:4},
{c:'Jacuipense',f:'Atlético-BA',gc:1,gf:0,r:4},
// R4 — restante (18 jogos do dia 26/04, mais Portuguesa-RJ x Pouso Alegre 25/04)
{c:'Monte Roraima',f:'GAS',gc:0,gf:0,r:4},
{c:'Araguaína',f:'Independência',gc:1,gf:1,r:4},
{c:'Humaitá',f:'Galvez',gc:0,gf:1,r:4},
{c:'União-MT',f:'Operário-MT',gc:2,gf:1,r:4},
{c:'Oratório',f:'Trem',gc:0,gf:2,r:4},
{c:'Parnahyba',f:'Sampaio Corrêa',gc:1,gf:0,r:4},
{c:'Atlético-CE',f:'Ferroviário',gc:0,gf:2,r:4},
{c:'Piauí',f:'Altos',gc:3,gf:1,r:4},
{c:'Maguary',f:'Central',gc:0,gf:2,r:4},
{c:'Laguna',f:'América-RN',gc:0,gf:1,r:4},
{c:'Decisão',f:'Retrô',gc:3,gf:2,r:4},
{c:'Juazeirense',f:'ASA',gc:1,gf:0,r:4},
{c:'Ivinhema',f:'Operário-MS',gc:2,gf:0,r:4},
{c:'Rio Branco-ES',f:'Real Noroeste',gc:2,gf:0,r:4},
{c:'Portuguesa-RJ',f:'Pouso Alegre',gc:2,gf:0,r:4},
{c:'Guarany de Bagé',f:'São Luiz-RS',gc:0,gf:1,r:4},
{c:'FC Cascavel',f:'Cianorte',gc:0,gf:1,r:4},
{c:'Azuriz',f:'São Joseense',gc:0,gf:1,r:4},
{c:'Moto Club',f:'Sampaio Corrêa',gc:1,gf:0,r:3}, // R3 remarcado p/ 06/05
// R5 (Tabela Detalhada CBF) — Decisão×Treze adiado p/ 06/06, fora
{c:'Nacional-AM',f:'São Raimundo-RR',gc:0,gf:0,r:5},{c:'Monte Roraima',f:'Manaus',gc:2,gf:2,r:5},{c:'GAS',f:'Manauara',gc:1,gf:2,r:5},{c:'Independência',f:'Porto Velho',gc:1,gf:1,r:5},{c:'Araguaína',f:'Humaitá',gc:6,gf:0,r:5},{c:'Galvez',f:'Guaporé',gc:3,gf:3,r:5},{c:'Gama',f:'Luverdense',gc:4,gf:0,r:5},{c:'Brasiliense',f:'Aparecidense',gc:1,gf:1,r:5},{c:'Primavera',f:'Inhumas',gc:2,gf:0,r:5},{c:'Mixto',f:'Capital',gc:1,gf:1,r:5},{c:'Goiatuba',f:'União-MT',gc:5,gf:1,r:5},{c:'Operário-MT',f:'Ceilândia',gc:0,gf:1,r:5},{c:'Tocantinópolis',f:'Tuna Luso',gc:1,gf:1,r:5},{c:'Oratório',f:'Águia de Marabá',gc:1,gf:2,r:5},{c:'Trem',f:'Imperatriz',gc:2,gf:1,r:5},{c:'Moto Club',f:'Iguatu',gc:0,gf:0,r:5},{c:'Parnahyba',f:'IAPE',gc:3,gf:1,r:5},{c:'Sampaio Corrêa',f:'Maracanã',gc:0,gf:0,r:5},{c:'Altos',f:'Tirol',gc:2,gf:1,r:5},{c:'Atlético-CE',f:'Fluminense-PI',gc:1,gf:1,r:5},{c:'Ferroviário',f:'Piauí',gc:2,gf:1,r:5},{c:'ABC',f:'Central',gc:1,gf:1,r:5},{c:'Sousa',f:'Laguna',gc:1,gf:0,r:5},{c:'América-RN',f:'Maguary',gc:0,gf:0,r:5},{c:'Lagarto',f:'Serra Branca',gc:1,gf:2,r:5},{c:'Retrô',f:'Sergipe',gc:1,gf:3,r:5},{c:'CSA',f:'Juazeirense',gc:2,gf:0,r:5},{c:'Atlético-BA',f:'ASA',gc:2,gf:1,r:5},{c:'CSE',f:'Jacuipense',gc:3,gf:2,r:5},{c:'ABECAT',f:'Ivinhema',gc:1,gf:1,r:5},{c:'Uberlândia',f:'Operário-MS',gc:2,gf:1,r:5},{c:'CRAC',f:'Betim',gc:1,gf:0,r:5},{c:'Real Noroeste',f:'Porto',gc:1,gf:2,r:5},{c:'Tombense',f:'Rio Branco-ES',gc:0,gf:0,r:5},{c:'Democrata GV',f:'Vitória-ES',gc:2,gf:0,r:5},{c:'America-RJ',f:'Pouso Alegre',gc:0,gf:0,r:5},{c:'Água Santa',f:'Portuguesa-RJ',gc:1,gf:0,r:5},{c:'Portuguesa-SP',f:'Madureira',gc:2,gf:1,r:5},{c:'Noroeste',f:'Maricá',gc:1,gf:0,r:5},{c:'Sampaio Corrêa-RJ',f:'XV de Piracicaba',gc:1,gf:1,r:5},{c:'Nova Iguaçu',f:'Velo Clube',gc:0,gf:0,r:5},{c:'Santa Catarina',f:'Guarany de Bagé',gc:3,gf:0,r:5},{c:'Joinville',f:'FC Cascavel',gc:1,gf:1,r:5},{c:'São Luiz-RS',f:'Cianorte',gc:0,gf:1,r:5},{c:'São Joseense',f:'Blumenau',gc:1,gf:0,r:5},{c:'Brasil-RS',f:'Marcílio Dias',gc:0,gf:1,r:5},{c:'Azuriz',f:'São José-RS',gc:1,gf:1,r:5},
// R6 (Tabela Detalhada CBF)
{c:'Manaus',f:'Monte Roraima',gc:0,gf:2,r:6},{c:'São Raimundo-RR',f:'Nacional-AM',gc:0,gf:2,r:6},{c:'Manauara',f:'GAS',gc:0,gf:0,r:6},{c:'Porto Velho',f:'Independência',gc:2,gf:1,r:6},{c:'Guaporé',f:'Galvez',gc:1,gf:0,r:6},{c:'Humaitá',f:'Araguaína',gc:0,gf:7,r:6},{c:'Aparecidense',f:'Brasiliense',gc:2,gf:1,r:6},{c:'Luverdense',f:'Gama',gc:1,gf:2,r:6},{c:'Inhumas',f:'Primavera',gc:0,gf:2,r:6},{c:'Capital',f:'Mixto',gc:1,gf:0,r:6},{c:'Ceilândia',f:'Operário-MT',gc:0,gf:1,r:6},{c:'União-MT',f:'Goiatuba',gc:0,gf:0,r:6},{c:'Tuna Luso',f:'Tocantinópolis',gc:2,gf:3,r:6},{c:'Imperatriz',f:'Trem',gc:4,gf:0,r:6},{c:'Águia de Marabá',f:'Oratório',gc:5,gf:1,r:6},{c:'IAPE',f:'Parnahyba',gc:1,gf:2,r:6},{c:'Maracanã',f:'Sampaio Corrêa',gc:1,gf:1,r:6},{c:'Iguatu',f:'Moto Club',gc:3,gf:1,r:6},{c:'Tirol',f:'Altos',gc:1,gf:0,r:6},{c:'Fluminense-PI',f:'Atlético-CE',gc:1,gf:2,r:6},{c:'Piauí',f:'Ferroviário',gc:1,gf:1,r:6},{c:'Laguna',f:'Sousa',gc:0,gf:1,r:6},{c:'Maguary',f:'América-RN',gc:0,gf:0,r:6},{c:'Central',f:'ABC',gc:0,gf:1,r:6},{c:'Serra Branca',f:'Lagarto',gc:0,gf:0,r:6},{c:'Sergipe',f:'Retrô',gc:1,gf:0,r:6},{c:'Treze',f:'Decisão',gc:2,gf:0,r:6},{c:'ASA',f:'Atlético-BA',gc:3,gf:0,r:6},{c:'Jacuipense',f:'CSE',gc:2,gf:1,r:6},{c:'Juazeirense',f:'CSA',gc:0,gf:1,r:6},{c:'Betim',f:'CRAC',gc:0,gf:0,r:6},{c:'Operário-MS',f:'Uberlândia',gc:1,gf:2,r:6},{c:'Ivinhema',f:'ABECAT',gc:0,gf:0,r:6},{c:'Porto',f:'Real Noroeste',gc:1,gf:2,r:6},{c:'Rio Branco-ES',f:'Tombense',gc:2,gf:2,r:6},{c:'Vitória-ES',f:'Democrata GV',gc:2,gf:1,r:6},{c:'Pouso Alegre',f:'America-RJ',gc:3,gf:0,r:6},{c:'Madureira',f:'Portuguesa-SP',gc:1,gf:0,r:6},{c:'Portuguesa-RJ',f:'Água Santa',gc:2,gf:2,r:6},{c:'Maricá',f:'Noroeste',gc:0,gf:3,r:6},{c:'XV de Piracicaba',f:'Sampaio Corrêa-RJ',gc:1,gf:0,r:6},{c:'Velo Clube',f:'Nova Iguaçu',gc:1,gf:1,r:6},{c:'Guarany de Bagé',f:'Santa Catarina',gc:1,gf:0,r:6},{c:'Cianorte',f:'São Luiz-RS',gc:0,gf:1,r:6},{c:'FC Cascavel',f:'Joinville',gc:1,gf:0,r:6},{c:'Blumenau',f:'São Joseense',gc:0,gf:0,r:6},{c:'Marcílio Dias',f:'Brasil-RS',gc:4,gf:1,r:6},{c:'São José-RS',f:'Azuriz',gc:1,gf:0,r:6},
// R7 (Tabela Detalhada CBF)
{c:'Nacional-AM',f:'Manauara',gc:0,gf:1,r:7},{c:'GAS',f:'Monte Roraima',gc:2,gf:3,r:7},{c:'São Raimundo-RR',f:'Manaus',gc:0,gf:1,r:7},{c:'Galvez',f:'Humaitá',gc:4,gf:2,r:7},{c:'Porto Velho',f:'Guaporé',gc:0,gf:0,r:7},{c:'Independência',f:'Araguaína',gc:1,gf:0,r:7},{c:'Gama',f:'Brasiliense',gc:3,gf:2,r:7},{c:'Primavera',f:'Luverdense',gc:1,gf:0,r:7},{c:'Inhumas',f:'Aparecidense',gc:1,gf:1,r:7},{c:'Operário-MT',f:'União-MT',gc:1,gf:2,r:7},{c:'Mixto',f:'Goiatuba',gc:2,gf:0,r:7},{c:'Capital',f:'Ceilândia',gc:2,gf:1,r:7},{c:'Tocantinópolis',f:'Imperatriz',gc:2,gf:0,r:7},{c:'Trem',f:'Oratório',gc:4,gf:2,r:7},{c:'Tuna Luso',f:'Águia de Marabá',gc:2,gf:1,r:7},{c:'Maracanã',f:'Iguatu',gc:1,gf:1,r:7},{c:'Moto Club',f:'IAPE',gc:2,gf:2,r:7},{c:'Sampaio Corrêa',f:'Parnahyba',gc:4,gf:1,r:7},{c:'Altos',f:'Piauí',gc:0,gf:1,r:7},{c:'Tirol',f:'Fluminense-PI',gc:1,gf:1,r:7},{c:'Ferroviário',f:'Atlético-CE',gc:2,gf:0,r:7},{c:'ABC',f:'Sousa',gc:2,gf:0,r:7},{c:'Central',f:'Maguary',gc:0,gf:0,r:7},{c:'América-RN',f:'Laguna',gc:5,gf:0,r:7},{c:'Serra Branca',f:'Treze',gc:1,gf:2,r:7},{c:'Lagarto',f:'Sergipe',gc:1,gf:1,r:7},{c:'Retrô',f:'Decisão',gc:2,gf:1,r:7},{c:'ASA',f:'Juazeirense',gc:1,gf:0,r:7},{c:'CSE',f:'CSA',gc:1,gf:5,r:7},{c:'Atlético-BA',f:'Jacuipense',gc:0,gf:1,r:7},{c:'Operário-MS',f:'Ivinhema',gc:2,gf:0,r:7},{c:'CRAC',f:'ABECAT',gc:2,gf:1,r:7},{c:'Uberlândia',f:'Betim',gc:1,gf:1,r:7},{c:'Porto',f:'Vitória-ES',gc:0,gf:0,r:7},{c:'Real Noroeste',f:'Rio Branco-ES',gc:0,gf:0,r:7},{c:'Tombense',f:'Democrata GV',gc:3,gf:1,r:7},{c:'America-RJ',f:'Madureira',gc:3,gf:1,r:7},{c:'Portuguesa-SP',f:'Água Santa',gc:0,gf:0,r:7},{c:'Pouso Alegre',f:'Portuguesa-RJ',gc:0,gf:2,r:7},{c:'Nova Iguaçu',f:'Sampaio Corrêa-RJ',gc:2,gf:1,r:7},{c:'Noroeste',f:'Velo Clube',gc:3,gf:0,r:7},{c:'Maricá',f:'XV de Piracicaba',gc:1,gf:2,r:7},{c:'Santa Catarina',f:'Joinville',gc:1,gf:0,r:7},{c:'São Luiz-RS',f:'Guarany de Bagé',gc:2,gf:0,r:7},{c:'Cianorte',f:'FC Cascavel',gc:1,gf:0,r:7},{c:'Blumenau',f:'Marcílio Dias',gc:0,gf:1,r:7},{c:'Brasil-RS',f:'São José-RS',gc:0,gf:0,r:7},{c:'São Joseense',f:'Azuriz',gc:0,gf:1,r:7},
// R8 (Tabela Detalhada CBF)
{c:'GAS',f:'Nacional-AM',gc:0,gf:1,r:8},{c:'Monte Roraima',f:'São Raimundo-RR',gc:2,gf:2,r:8},{c:'Manauara',f:'Manaus',gc:1,gf:1,r:8},{c:'Humaitá',f:'Guaporé',gc:0,gf:4,r:8},{c:'Araguaína',f:'Porto Velho',gc:1,gf:1,r:8},{c:'Independência',f:'Galvez',gc:3,gf:1,r:8},{c:'Gama',f:'Primavera',gc:4,gf:0,r:8},{c:'Brasiliense',f:'Inhumas',gc:1,gf:0,r:8},{c:'Luverdense',f:'Aparecidense',gc:1,gf:0,r:8},{c:'União-MT',f:'Ceilândia',gc:2,gf:3,r:8},{c:'Mixto',f:'Operário-MT',gc:1,gf:1,r:8},{c:'Goiatuba',f:'Capital',gc:1,gf:1,r:8},{c:'Trem',f:'Tocantinópolis',gc:4,gf:1,r:8},{c:'Imperatriz',f:'Águia de Marabá',gc:0,gf:3,r:8},{c:'Oratório',f:'Tuna Luso',gc:3,gf:3,r:8},{c:'IAPE',f:'Iguatu',gc:1,gf:1,r:8},{c:'Parnahyba',f:'Maracanã',gc:0,gf:1,r:8},{c:'Sampaio Corrêa',f:'Moto Club',gc:4,gf:0,r:8},{c:'Ferroviário',f:'Altos',gc:3,gf:1,r:8},{c:'Piauí',f:'Fluminense-PI',gc:0,gf:1,r:8},{c:'Atlético-CE',f:'Tirol',gc:0,gf:3,r:8},{c:'Sousa',f:'Central',gc:0,gf:0,r:8},{c:'ABC',f:'América-RN',gc:1,gf:1,r:8},{c:'Laguna',f:'Maguary',gc:1,gf:1,r:8},{c:'Sergipe',f:'Treze',gc:0,gf:1,r:8},{c:'Decisão',f:'Serra Branca',gc:0,gf:1,r:8},{c:'Retrô',f:'Lagarto',gc:1,gf:1,r:8},{c:'CSA',f:'ASA',gc:1,gf:1,r:8},{c:'CSE',f:'Atlético-BA',gc:0,gf:0,r:8},{c:'Jacuipense',f:'Juazeirense',gc:2,gf:2,r:8},{c:'Betim',f:'Ivinhema',gc:3,gf:0,r:8},{c:'ABECAT',f:'Operário-MS',gc:2,gf:0,r:8},{c:'CRAC',f:'Uberlândia',gc:0,gf:0,r:8},{c:'Tombense',f:'Real Noroeste',gc:1,gf:1,r:8},{c:'Rio Branco-ES',f:'Vitória-ES',gc:0,gf:2,r:8},{c:'Democrata GV',f:'Porto',gc:3,gf:1,r:8},{c:'Portuguesa-SP',f:'America-RJ',gc:4,gf:1,r:8},{c:'Água Santa',f:'Pouso Alegre',gc:2,gf:0,r:8},{c:'Madureira',f:'Portuguesa-RJ',gc:1,gf:1,r:8},{c:'Nova Iguaçu',f:'Noroeste',gc:1,gf:0,r:8},{c:'Sampaio Corrêa-RJ',f:'Maricá',gc:1,gf:1,r:8},{c:'Velo Clube',f:'XV de Piracicaba',gc:1,gf:1,r:8},{c:'Santa Catarina',f:'São Luiz-RS',gc:1,gf:0,r:8},{c:'Joinville',f:'Cianorte',gc:0,gf:0,r:8},{c:'Guarany de Bagé',f:'FC Cascavel',gc:0,gf:4,r:8},{c:'São José-RS',f:'Marcílio Dias',gc:1,gf:1,r:8},{c:'Azuriz',f:'Blumenau',gc:2,gf:4,r:8},{c:'São Joseense',f:'Brasil-RS',gc:0,gf:0,r:8},
// R9 (parcial — 23 jogos até 30/05; sex 29/05 + sáb 30/05). Demais em 31/05+
{c:'América-RN',f:'Central',gc:1,gf:0,r:9},{c:'São Raimundo-RR',f:'GAS',gc:4,gf:0,r:9},{c:'Galvez',f:'Porto Velho',gc:2,gf:6,r:9},{c:'Guaporé',f:'Araguaína',gc:3,gf:2,r:9},{c:'Aparecidense',f:'Primavera',gc:1,gf:1,r:9},{c:'Operário-MT',f:'Capital',gc:1,gf:5,r:9},{c:'União-MT',f:'Mixto',gc:2,gf:2,r:9},{c:'Ceilândia',f:'Goiatuba',gc:1,gf:1,r:9},{c:'Águia de Marabá',f:'Tocantinópolis',gc:3,gf:1,r:9},{c:'Iguatu',f:'Parnahyba',gc:2,gf:2,r:9},{c:'Moto Club',f:'Maracanã',gc:1,gf:2,r:9},{c:'Treze',f:'Lagarto',gc:1,gf:2,r:9},{c:'ASA',f:'CSE',gc:0,gf:0,r:9},{c:'ABECAT',f:'Betim',gc:2,gf:1,r:9},{c:'Porto',f:'Tombense',gc:1,gf:3,r:9},{c:'Vitória-ES',f:'Real Noroeste',gc:1,gf:1,r:9},{c:'Água Santa',f:'Madureira',gc:4,gf:1,r:9},{c:'Pouso Alegre',f:'Portuguesa-SP',gc:1,gf:2,r:9},{c:'Portuguesa-RJ',f:'America-RJ',gc:2,gf:2,r:9},{c:'Maricá',f:'Nova Iguaçu',gc:1,gf:0,r:9},{c:'XV de Piracicaba',f:'Noroeste',gc:1,gf:1,r:9},{c:'Sampaio Corrêa-RJ',f:'Velo Clube',gc:1,gf:0,r:9},{c:'Joinville',f:'Guarany de Bagé',gc:2,gf:0,r:9},
// R9 completada (jogos de 31/05 e 01/06) — Tabela Detalhada CBF 02/06
{c:'Monte Roraima',f:'Manauara',gc:1,gf:1,r:9},{c:'Manaus',f:'Nacional-AM',gc:0,gf:1,r:9},{c:'Humaitá',f:'Independência',gc:0,gf:4,r:9},{c:'Brasiliense',f:'Luverdense',gc:1,gf:1,r:9},{c:'Inhumas',f:'Gama',gc:0,gf:2,r:9},{c:'Oratório',f:'Imperatriz',gc:0,gf:1,r:9},{c:'Tuna Luso',f:'Trem',gc:1,gf:0,r:9},{c:'IAPE',f:'Sampaio Corrêa',gc:1,gf:3,r:9},{c:'Fluminense-PI',f:'Altos',gc:1,gf:1,r:9},{c:'Atlético-CE',f:'Piauí',gc:0,gf:1,r:9},{c:'Tirol',f:'Ferroviário',gc:0,gf:0,r:9},{c:'Laguna',f:'ABC',gc:0,gf:2,r:9},{c:'Maguary',f:'Sousa',gc:2,gf:0,r:9},{c:'Decisão',f:'Sergipe',gc:3,gf:2,r:9},{c:'Serra Branca',f:'Retrô',gc:0,gf:0,r:9},{c:'Juazeirense',f:'Atlético-BA',gc:0,gf:0,r:9},{c:'CSA',f:'Jacuipense',gc:1,gf:1,r:9},{c:'Operário-MS',f:'CRAC',gc:2,gf:0,r:9},{c:'Ivinhema',f:'Uberlândia',gc:1,gf:1,r:9},{c:'Democrata GV',f:'Rio Branco-ES',gc:3,gf:1,r:9},{c:'Cianorte',f:'Santa Catarina',gc:1,gf:3,r:9},{c:'FC Cascavel',f:'São Luiz-RS',gc:0,gf:0,r:9},{c:'Brasil-RS',f:'Blumenau',gc:1,gf:2,r:9},{c:'São José-RS',f:'São Joseense',gc:1,gf:0,r:9},{c:'Marcílio Dias',f:'Azuriz',gc:0,gf:1,r:9}
,
// R10 (04-05/04 - parcial)
{c:'Gama',f:'Aparecidense',gc:2,gf:2,r:10},{c:'Primavera',f:'Brasiliense',gc:1,gf:2,r:10},{c:'Luverdense',f:'Inhumas',gc:4,gf:0,r:10},{c:'Mixto',f:'Ceilândia',gc:1,gf:1,r:10},{c:'Goiatuba',f:'Operário-MT',gc:1,gf:0,r:10},{c:'Capital',f:'União-MT',gc:2,gf:0,r:10},{c:'Trem',f:'Águia de Marabá',gc:2,gf:0,r:10},{c:'Tocantinópolis',f:'Oratório',gc:7,gf:1,r:10},{c:'Imperatriz',f:'Tuna Luso',gc:4,gf:0,r:10},{c:'Sampaio Corrêa',f:'Iguatu',gc:0,gf:1,r:10},{c:'Parnahyba',f:'Moto Club',gc:1,gf:0,r:10},{c:'Maracanã',f:'IAPE',gc:2,gf:0,r:10},{c:'Portuguesa-SP',f:'Portuguesa-RJ',gc:2,gf:0,r:10},{c:'America-RJ',f:'Água Santa',gc:1,gf:0,r:10},{c:'Madureira',f:'Pouso Alegre',gc:1,gf:0,r:10},{c:'Nova Iguaçu',f:'XV de Piracicaba',gc:1,gf:0,r:10},{c:'Noroeste',f:'Sampaio Corrêa-RJ',gc:1,gf:0,r:10},{c:'Velo Clube',f:'Maricá',gc:3,gf:1,r:10},{c:'Santa Catarina',f:'FC Cascavel',gc:1,gf:0,r:10},{c:'São Luiz-RS',f:'Joinville',gc:3,gf:1,r:10},{c:'Guarany de Bagé',f:'Cianorte',gc:0,gf:1,r:10},{c:'São Joseense',f:'Marcílio Dias',gc:0,gf:0,r:10},{c:'Blumenau',f:'São José-RS',gc:0,gf:1,r:10},{c:'Azuriz',f:'Brasil-RS',gc:1,gf:1,r:10}
];
const SD_GRP_DATES=['05/04','12/04','19/04','26/04','03/05','10/05','17/05','24/05','31/05','14/06'];
const SD_MM_DATES={f2:'21/06 e 28/06',f3:'05/07 e 12/07',oit:'19/07 e 26/07',qrt:'02/08 e 09/08',po:'16/08 e 23/08',semi:'30/08 e 06/09',final:'13/09'};
const genGrpTab=(g)=>{const n=g.length,j=[],t=[...g],rds=[];for(let r=0;r<n-1;r++){const rm=[];for(let i=0;i<n/2;i++)rm.push([t[i],t[n-1-i]]);rds.push(rm);const l=t.pop();t.splice(1,0,l);}let rd=1;for(const r of rds){for(const[a,b]of r)j.push({casa:a,fora:b,rodada:rd,data:SD_GRP_DATES[rd-1]||''});rd++;}for(const r of rds){for(const[a,b]of r)j.push({casa:b,fora:a,rodada:rd,data:SD_GRP_DATES[rd-1]||''});rd++;}return j;};
// === TABELA OFICIAL CBF SÉRIE D 2026 ===
// 480 jogos da fase de grupos extraídos da Tabela Detalhada CBF (PDF oficial, atualização 25/03/2026).
// Substitui o genGrpTab algorítmico, garantindo que mando casa/fora bate com o calendário real.
const SD_REAL_TAB=[{ref:1,rodada:1,data:"04/04",dia:"sáb",hora:"18:00",grupo:0,casa:"Manaus",fora:"GAS"},{ref:2,rodada:1,data:"04/04",dia:"sáb",hora:"18:00",grupo:0,casa:"Monte Roraima",fora:"Nacional-AM"},{ref:3,rodada:1,data:"05/04",dia:"dom",hora:"18:00",grupo:0,casa:"São Raimundo-RR",fora:"Manauara"},{ref:4,rodada:1,data:"04/04",dia:"sáb",hora:"17:00",grupo:1,casa:"Guaporé",fora:"Independência"},{ref:5,rodada:1,data:"04/04",dia:"sáb",hora:"20:00",grupo:1,casa:"Galvez",fora:"Araguaína"},{ref:6,rodada:1,data:"05/04",dia:"dom",hora:"18:00",grupo:1,casa:"Humaitá",fora:"Porto Velho"},{ref:7,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:2,casa:"Aparecidense",fora:"Gama"},{ref:8,rodada:1,data:"05/04",dia:"dom",hora:"16:00",grupo:2,casa:"Brasiliense",fora:"Primavera"},{ref:9,rodada:1,data:"04/04",dia:"sáb",hora:"18:30",grupo:2,casa:"Inhumas",fora:"Luverdense"},{ref:10,rodada:1,data:"05/04",dia:"dom",hora:"16:00",grupo:3,casa:"Ceilândia",fora:"Mixto"},{ref:11,rodada:1,data:"05/04",dia:"dom",hora:"17:00",grupo:3,casa:"Operário-MT",fora:"Goiatuba"},{ref:12,rodada:1,data:"04/04",dia:"sáb",hora:"17:00",grupo:3,casa:"União-MT",fora:"Capital"},{ref:13,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:4,casa:"Águia de Marabá",fora:"Trem"},{ref:14,rodada:1,data:"22/04",dia:"qua",hora:"20:00",grupo:4,casa:"Oratório",fora:"Tocantinópolis"},{ref:15,rodada:1,data:"05/04",dia:"dom",hora:"16:00",grupo:4,casa:"Tuna Luso",fora:"Imperatriz"},{ref:16,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:5,casa:"Iguatu",fora:"Sampaio Corrêa"},{ref:17,rodada:1,data:"05/04",dia:"dom",hora:"17:00",grupo:5,casa:"Moto Club",fora:"Parnahyba"},{ref:18,rodada:1,data:"04/04",dia:"sáb",hora:"15:30",grupo:5,casa:"IAPE",fora:"Maracanã"},{ref:19,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:6,casa:"Fluminense-PI",fora:"Ferroviário"},{ref:20,rodada:1,data:"05/04",dia:"dom",hora:"16:00",grupo:6,casa:"Atlético-CE",fora:"Altos"},{ref:21,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:6,casa:"Tirol",fora:"Piauí"},{ref:22,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:7,casa:"Maguary",fora:"ABC"},{ref:23,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:7,casa:"América-RN",fora:"Sousa"},{ref:24,rodada:1,data:"05/04",dia:"dom",hora:"16:00",grupo:7,casa:"Laguna",fora:"Central"},{ref:25,rodada:1,data:"04/04",dia:"sáb",hora:"17:00",grupo:8,casa:"Treze",fora:"Retrô"},{ref:26,rodada:1,data:"05/04",dia:"dom",hora:"16:00",grupo:8,casa:"Decisão",fora:"Lagarto"},{ref:27,rodada:1,data:"05/04",dia:"dom",hora:"16:30",grupo:8,casa:"Serra Branca",fora:"Sergipe"},{ref:28,rodada:1,data:"04/04",dia:"sáb",hora:"15:30",grupo:9,casa:"Juazeirense",fora:"CSE"},{ref:29,rodada:1,data:"05/04",dia:"dom",hora:"16:00",grupo:9,casa:"CSA",fora:"Atlético-BA"},{ref:30,rodada:1,data:"04/04",dia:"sáb",hora:"17:00",grupo:9,casa:"ASA",fora:"Jacuipense"},{ref:31,rodada:1,data:"05/04",dia:"dom",hora:"18:00",grupo:10,casa:"Ivinhema",fora:"CRAC"},{ref:32,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:10,casa:"ABECAT",fora:"Uberlândia"},{ref:33,rodada:1,data:"05/04",dia:"dom",hora:"17:00",grupo:10,casa:"Operário-MS",fora:"Betim"},{ref:34,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:11,casa:"Vitória-ES",fora:"Tombense"},{ref:35,rodada:1,data:"06/04",dia:"seg",hora:"20:30",grupo:11,casa:"Democrata GV",fora:"Real Noroeste"},{ref:36,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:11,casa:"Porto",fora:"Rio Branco-ES"},{ref:37,rodada:1,data:"04/04",dia:"sáb",hora:"19:00",grupo:12,casa:"Portuguesa-RJ",fora:"Portuguesa-SP"},{ref:38,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:12,casa:"Água Santa",fora:"America-RJ"},{ref:39,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:12,casa:"Pouso Alegre",fora:"Madureira"},{ref:40,rodada:1,data:"04/04",dia:"sáb",hora:"18:00",grupo:13,casa:"XV de Piracicaba",fora:"Nova Iguaçu"},{ref:41,rodada:1,data:"04/04",dia:"sáb",hora:"19:00",grupo:13,casa:"Sampaio Corrêa-RJ",fora:"Noroeste"},{ref:42,rodada:1,data:"04/04",dia:"sáb",hora:"17:00",grupo:13,casa:"Maricá",fora:"Velo Clube"},{ref:43,rodada:1,data:"05/04",dia:"dom",hora:"16:00",grupo:14,casa:"FC Cascavel",fora:"Santa Catarina"},{ref:44,rodada:1,data:"04/04",dia:"sáb",hora:"16:00",grupo:14,casa:"Joinville",fora:"São Luiz-RS"},{ref:45,rodada:1,data:"05/04",dia:"dom",hora:"16:00",grupo:14,casa:"Cianorte",fora:"Guarany de Bagé"},{ref:46,rodada:1,data:"05/04",dia:"dom",hora:"16:00",grupo:15,casa:"Marcílio Dias",fora:"São Joseense"},{ref:47,rodada:1,data:"04/04",dia:"sáb",hora:"17:00",grupo:15,casa:"São José-RS",fora:"Blumenau"},{ref:48,rodada:1,data:"05/04",dia:"dom",hora:"15:30",grupo:15,casa:"Brasil-RS",fora:"Azuriz"},{ref:49,rodada:2,data:"11/04",dia:"sáb",hora:"18:00",grupo:0,casa:"Manauara",fora:"Monte Roraima"},{ref:50,rodada:2,data:"12/04",dia:"dom",hora:"18:00",grupo:0,casa:"GAS",fora:"São Raimundo-RR"},{ref:51,rodada:2,data:"12/04",dia:"dom",hora:"17:00",grupo:0,casa:"Nacional-AM",fora:"Manaus"},{ref:52,rodada:2,data:"12/04",dia:"dom",hora:"17:00",grupo:1,casa:"Porto Velho",fora:"Galvez"},{ref:53,rodada:2,data:"12/04",dia:"dom",hora:"18:00",grupo:1,casa:"Independência",fora:"Humaitá"},{ref:54,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:1,casa:"Araguaína",fora:"Guaporé"},{ref:55,rodada:2,data:"11/04",dia:"sáb",hora:"18:00",grupo:2,casa:"Luverdense",fora:"Brasiliense"},{ref:56,rodada:2,data:"11/04",dia:"sáb",hora:"19:30",grupo:2,casa:"Gama",fora:"Inhumas"},{ref:57,rodada:2,data:"12/04",dia:"dom",hora:"17:00",grupo:2,casa:"Primavera",fora:"Aparecidense"},{ref:58,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:3,casa:"Capital",fora:"Operário-MT"},{ref:59,rodada:2,data:"11/04",dia:"sáb",hora:"18:00",grupo:3,casa:"Mixto",fora:"União-MT"},{ref:60,rodada:2,data:"11/04",dia:"sáb",hora:"18:30",grupo:3,casa:"Goiatuba",fora:"Ceilândia"},{ref:61,rodada:2,data:"11/04",dia:"sáb",hora:"19:30",grupo:4,casa:"Imperatriz",fora:"Oratório"},{ref:62,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:4,casa:"Trem",fora:"Tuna Luso"},{ref:63,rodada:2,data:"11/04",dia:"sáb",hora:"16:00",grupo:4,casa:"Tocantinópolis",fora:"Águia de Marabá"},{ref:64,rodada:2,data:"11/04",dia:"sáb",hora:"18:30",grupo:5,casa:"Maracanã",fora:"Moto Club"},{ref:65,rodada:2,data:"11/04",dia:"sáb",hora:"17:00",grupo:5,casa:"Sampaio Corrêa",fora:"IAPE"},{ref:66,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:5,casa:"Parnahyba",fora:"Iguatu"},{ref:67,rodada:2,data:"11/04",dia:"sáb",hora:"17:00",grupo:6,casa:"Piauí",fora:"Atlético-CE"},{ref:68,rodada:2,data:"12/04",dia:"dom",hora:"17:00",grupo:6,casa:"Ferroviário",fora:"Tirol"},{ref:69,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:6,casa:"Altos",fora:"Fluminense-PI"},{ref:70,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:7,casa:"Central",fora:"América-RN"},{ref:71,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:7,casa:"ABC",fora:"Laguna"},{ref:72,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:7,casa:"Sousa",fora:"Maguary"},{ref:73,rodada:2,data:"11/04",dia:"sáb",hora:"18:00",grupo:8,casa:"Sergipe",fora:"Decisão"},{ref:74,rodada:2,data:"12/04",dia:"dom",hora:"17:30",grupo:8,casa:"Retrô",fora:"Serra Branca"},{ref:75,rodada:2,data:"11/04",dia:"sáb",hora:"18:00",grupo:8,casa:"Lagarto",fora:"Treze"},{ref:76,rodada:2,data:"11/04",dia:"sáb",hora:"16:00",grupo:9,casa:"Jacuipense",fora:"CSA"},{ref:77,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:9,casa:"CSE",fora:"ASA"},{ref:78,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:9,casa:"Atlético-BA",fora:"Juazeirense"},{ref:79,rodada:2,data:"11/04",dia:"sáb",hora:"16:00",grupo:10,casa:"Betim",fora:"ABECAT"},{ref:80,rodada:2,data:"12/04",dia:"dom",hora:"18:00",grupo:10,casa:"CRAC",fora:"Operário-MS"},{ref:81,rodada:2,data:"11/04",dia:"sáb",hora:"17:00",grupo:10,casa:"Uberlândia",fora:"Ivinhema"},{ref:82,rodada:2,data:"12/04",dia:"dom",hora:"17:00",grupo:11,casa:"Rio Branco-ES",fora:"Democrata GV"},{ref:83,rodada:2,data:"11/04",dia:"sáb",hora:"18:00",grupo:11,casa:"Tombense",fora:"Porto"},{ref:84,rodada:2,data:"11/04",dia:"sáb",hora:"17:00",grupo:11,casa:"Real Noroeste",fora:"Vitória-ES"},{ref:85,rodada:2,data:"11/04",dia:"sáb",hora:"16:00",grupo:12,casa:"Madureira",fora:"Água Santa"},{ref:86,rodada:2,data:"11/04",dia:"sáb",hora:"16:00",grupo:12,casa:"Portuguesa-SP",fora:"Pouso Alegre"},{ref:87,rodada:2,data:"11/04",dia:"sáb",hora:"15:00",grupo:12,casa:"America-RJ",fora:"Portuguesa-RJ"},{ref:88,rodada:2,data:"11/04",dia:"sáb",hora:"19:00",grupo:13,casa:"Velo Clube",fora:"Sampaio Corrêa-RJ"},{ref:89,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:13,casa:"Nova Iguaçu",fora:"Maricá"},{ref:90,rodada:2,data:"11/04",dia:"sáb",hora:"18:00",grupo:13,casa:"Noroeste",fora:"XV de Piracicaba"},{ref:91,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:14,casa:"Guarany de Bagé",fora:"Joinville"},{ref:92,rodada:2,data:"11/04",dia:"sáb",hora:"18:00",grupo:14,casa:"Santa Catarina",fora:"Cianorte"},{ref:93,rodada:2,data:"11/04",dia:"sáb",hora:"16:00",grupo:14,casa:"São Luiz-RS",fora:"FC Cascavel"},{ref:94,rodada:2,data:"12/04",dia:"dom",hora:"16:00",grupo:15,casa:"Blumenau",fora:"Brasil-RS"},{ref:95,rodada:2,data:"11/04",dia:"sáb",hora:"18:00",grupo:15,casa:"Azuriz",fora:"Marcílio Dias"},{ref:96,rodada:2,data:"11/04",dia:"sáb",hora:"19:00",grupo:15,casa:"São Joseense",fora:"São José-RS"},{ref:97,rodada:3,data:"19/04",dia:"dom",hora:"17:00",grupo:0,casa:"Nacional-AM",fora:"GAS"},{ref:98,rodada:3,data:"19/04",dia:"dom",hora:"18:00",grupo:0,casa:"São Raimundo-RR",fora:"Monte Roraima"},{ref:99,rodada:3,data:"19/04",dia:"dom",hora:"18:00",grupo:0,casa:"Manaus",fora:"Manauara"},{ref:100,rodada:3,data:"18/04",dia:"sáb",hora:"20:00",grupo:1,casa:"Galvez",fora:"Independência"},{ref:101,rodada:3,data:"19/04",dia:"dom",hora:"17:00",grupo:1,casa:"Porto Velho",fora:"Araguaína"},{ref:102,rodada:3,data:"18/04",dia:"sáb",hora:"20:30",grupo:1,casa:"Guaporé",fora:"Humaitá"},{ref:103,rodada:3,data:"19/04",dia:"dom",hora:"17:00",grupo:2,casa:"Primavera",fora:"Gama"},{ref:104,rodada:3,data:"18/04",dia:"sáb",hora:"18:30",grupo:2,casa:"Inhumas",fora:"Brasiliense"},{ref:105,rodada:3,data:"18/04",dia:"sáb",hora:"16:00",grupo:2,casa:"Aparecidense",fora:"Luverdense"},{ref:106,rodada:3,data:"18/04",dia:"sáb",hora:"17:00",grupo:3,casa:"Operário-MT",fora:"Mixto"},{ref:107,rodada:3,data:"19/04",dia:"dom",hora:"16:00",grupo:3,casa:"Capital",fora:"Goiatuba"},{ref:108,rodada:3,data:"18/04",dia:"sáb",hora:"16:00",grupo:3,casa:"Ceilândia",fora:"União-MT"},{ref:109,rodada:3,data:"18/04",dia:"sáb",hora:"16:00",grupo:4,casa:"Tocantinópolis",fora:"Trem"},{ref:110,rodada:3,data:"19/04",dia:"dom",hora:"16:00",grupo:4,casa:"Tuna Luso",fora:"Oratório"},{ref:111,rodada:3,data:"19/04",dia:"dom",hora:"16:00",grupo:4,casa:"Águia de Marabá",fora:"Imperatriz"},{ref:112,rodada:3,data:"18/04",dia:"sáb",hora:"17:00",grupo:5,casa:"Moto Club",fora:"Sampaio Corrêa"},{ref:113,rodada:3,data:"18/04",dia:"sáb",hora:"18:30",grupo:5,casa:"Maracanã",fora:"Parnahyba"},{ref:114,rodada:3,data:"18/04",dia:"sáb",hora:"16:00",grupo:5,casa:"Iguatu",fora:"IAPE"},{ref:115,rodada:3,data:"18/04",dia:"sáb",hora:"16:00",grupo:6,casa:"Altos",fora:"Ferroviário"},{ref:116,rodada:3,data:"18/04",dia:"sáb",hora:"16:00",grupo:6,casa:"Tirol",fora:"Atlético-CE"},{ref:117,rodada:3,data:"19/04",dia:"dom",hora:"16:00",grupo:6,casa:"Fluminense-PI",fora:"Piauí"},{ref:118,rodada:3,data:"19/04",dia:"dom",hora:"16:00",grupo:7,casa:"América-RN",fora:"ABC"},{ref:119,rodada:3,data:"19/04",dia:"dom",hora:"16:00",grupo:7,casa:"Central",fora:"Sousa"},{ref:120,rodada:3,data:"19/04",dia:"dom",hora:"16:00",grupo:7,casa:"Maguary",fora:"Laguna"},{ref:121,rodada:3,data:"18/04",dia:"sáb",hora:"18:00",grupo:8,casa:"Lagarto",fora:"Retrô"},{ref:122,rodada:3,data:"18/04",dia:"sáb",hora:"16:30",grupo:8,casa:"Serra Branca",fora:"Decisão"},{ref:123,rodada:3,data:"19/04",dia:"dom",hora:"17:00",grupo:8,casa:"Treze",fora:"Sergipe"},{ref:124,rodada:3,data:"19/04",dia:"dom",hora:"16:00",grupo:9,casa:"Atlético-BA",fora:"CSE"},{ref:125,rodada:3,data:"18/04",dia:"sáb",hora:"17:00",grupo:9,casa:"ASA",fora:"CSA"},{ref:126,rodada:3,data:"19/04",dia:"dom",hora:"15:30",grupo:9,casa:"Juazeirense",fora:"Jacuipense"},{ref:127,rodada:3,data:"18/04",dia:"sáb",hora:"17:00",grupo:10,casa:"Uberlândia",fora:"CRAC"},{ref:128,rodada:3,data:"19/04",dia:"dom",hora:"17:00",grupo:10,casa:"Operário-MS",fora:"ABECAT"},{ref:129,rodada:3,data:"19/04",dia:"dom",hora:"18:00",grupo:10,casa:"Ivinhema",fora:"Betim"},{ref:130,rodada:3,data:"18/04",dia:"sáb",hora:"17:00",grupo:11,casa:"Real Noroeste",fora:"Tombense"},{ref:131,rodada:3,data:"18/04",dia:"sáb",hora:"16:00",grupo:11,casa:"Porto",fora:"Democrata GV"},{ref:132,rodada:3,data:"18/04",dia:"sáb",hora:"16:00",grupo:11,casa:"Vitória-ES",fora:"Rio Branco-ES"},{ref:133,rodada:3,data:"18/04",dia:"sáb",hora:"15:00",grupo:12,casa:"America-RJ",fora:"Portuguesa-SP"},{ref:134,rodada:3,data:"18/04",dia:"sáb",hora:"16:00",grupo:12,casa:"Pouso Alegre",fora:"Água Santa"},{ref:135,rodada:3,data:"18/04",dia:"sáb",hora:"19:00",grupo:12,casa:"Portuguesa-RJ",fora:"Madureira"},{ref:136,rodada:3,data:"18/04",dia:"sáb",hora:"18:00",grupo:13,casa:"Noroeste",fora:"Nova Iguaçu"},{ref:137,rodada:3,data:"18/04",dia:"sáb",hora:"17:00",grupo:13,casa:"Maricá",fora:"Sampaio Corrêa-RJ"},{ref:138,rodada:3,data:"18/04",dia:"sáb",hora:"18:00",grupo:13,casa:"XV de Piracicaba",fora:"Velo Clube"},{ref:139,rodada:3,data:"18/04",dia:"sáb",hora:"16:00",grupo:14,casa:"São Luiz-RS",fora:"Santa Catarina"},{ref:140,rodada:3,data:"19/04",dia:"dom",hora:"16:00",grupo:14,casa:"Cianorte",fora:"Joinville"},{ref:141,rodada:3,data:"19/04",dia:"dom",hora:"16:00",grupo:14,casa:"FC Cascavel",fora:"Guarany de Bagé"},{ref:142,rodada:3,data:"18/04",dia:"sáb",hora:"19:00",grupo:15,casa:"Marcílio Dias",fora:"São José-RS"},{ref:143,rodada:3,data:"19/04",dia:"dom",hora:"15:30",grupo:15,casa:"Blumenau",fora:"Azuriz"},{ref:144,rodada:3,data:"19/04",dia:"dom",hora:"16:00",grupo:15,casa:"Brasil-RS",fora:"São Joseense"},{ref:145,rodada:4,data:"26/04",dia:"dom",hora:"18:00",grupo:0,casa:"Monte Roraima",fora:"GAS"},{ref:146,rodada:4,data:"26/04",dia:"dom",hora:"18:00",grupo:0,casa:"Manauara",fora:"Nacional-AM"},{ref:147,rodada:4,data:"25/04",dia:"sáb",hora:"18:00",grupo:0,casa:"Manaus",fora:"São Raimundo-RR"},{ref:148,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:1,casa:"Araguaína",fora:"Independência"},{ref:149,rodada:4,data:"26/04",dia:"dom",hora:"18:00",grupo:1,casa:"Humaitá",fora:"Galvez"},{ref:150,rodada:4,data:"25/04",dia:"sáb",hora:"20:30",grupo:1,casa:"Guaporé",fora:"Porto Velho"},{ref:151,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:2,casa:"Brasiliense",fora:"Gama"},{ref:152,rodada:4,data:"25/04",dia:"sáb",hora:"18:00",grupo:2,casa:"Luverdense",fora:"Primavera"},{ref:153,rodada:4,data:"25/04",dia:"sáb",hora:"16:00",grupo:2,casa:"Aparecidense",fora:"Inhumas"},{ref:154,rodada:4,data:"25/04",dia:"sáb",hora:"18:30",grupo:3,casa:"Goiatuba",fora:"Mixto"},{ref:155,rodada:4,data:"25/04",dia:"sáb",hora:"17:00",grupo:3,casa:"União-MT",fora:"Operário-MT"},{ref:156,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:3,casa:"Ceilândia",fora:"Capital"},{ref:157,rodada:4,data:"26/04",dia:"dom",hora:"15:30",grupo:4,casa:"Oratório",fora:"Trem"},{ref:158,rodada:4,data:"25/04",dia:"sáb",hora:"19:30",grupo:4,casa:"Imperatriz",fora:"Tocantinópolis"},{ref:159,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:4,casa:"Águia de Marabá",fora:"Tuna Luso"},{ref:160,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:5,casa:"Parnahyba",fora:"Sampaio Corrêa"},{ref:161,rodada:4,data:"25/04",dia:"sáb",hora:"15:30",grupo:5,casa:"IAPE",fora:"Moto Club"},{ref:162,rodada:4,data:"25/04",dia:"sáb",hora:"16:00",grupo:5,casa:"Iguatu",fora:"Maracanã"},{ref:163,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:6,casa:"Atlético-CE",fora:"Ferroviário"},{ref:164,rodada:4,data:"26/04",dia:"dom",hora:"17:00",grupo:6,casa:"Piauí",fora:"Altos"},{ref:165,rodada:4,data:"25/04",dia:"sáb",hora:"16:00",grupo:6,casa:"Fluminense-PI",fora:"Tirol"},{ref:166,rodada:4,data:"25/04",dia:"sáb",hora:"16:00",grupo:7,casa:"Sousa",fora:"ABC"},{ref:167,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:7,casa:"Laguna",fora:"América-RN"},{ref:168,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:7,casa:"Maguary",fora:"Central"},{ref:169,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:8,casa:"Decisão",fora:"Retrô"},{ref:170,rodada:4,data:"25/04",dia:"sáb",hora:"18:00",grupo:8,casa:"Sergipe",fora:"Lagarto"},{ref:171,rodada:4,data:"25/04",dia:"sáb",hora:"17:00",grupo:8,casa:"Treze",fora:"Serra Branca"},{ref:172,rodada:4,data:"25/04",dia:"sáb",hora:"16:00",grupo:9,casa:"CSA",fora:"CSE"},{ref:173,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:9,casa:"Jacuipense",fora:"Atlético-BA"},{ref:174,rodada:4,data:"26/04",dia:"dom",hora:"15:30",grupo:9,casa:"Juazeirense",fora:"ASA"},{ref:175,rodada:4,data:"25/04",dia:"sáb",hora:"16:00",grupo:10,casa:"ABECAT",fora:"CRAC"},{ref:176,rodada:4,data:"25/04",dia:"sáb",hora:"16:00",grupo:10,casa:"Betim",fora:"Uberlândia"},{ref:177,rodada:4,data:"26/04",dia:"dom",hora:"18:00",grupo:10,casa:"Ivinhema",fora:"Operário-MS"},{ref:178,rodada:4,data:"25/04",dia:"sáb",hora:"20:30",grupo:11,casa:"Democrata GV",fora:"Tombense"},{ref:179,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:11,casa:"Rio Branco-ES",fora:"Real Noroeste"},{ref:180,rodada:4,data:"25/04",dia:"sáb",hora:"16:00",grupo:11,casa:"Vitória-ES",fora:"Porto"},{ref:181,rodada:4,data:"25/04",dia:"sáb",hora:"16:00",grupo:12,casa:"Água Santa",fora:"Portuguesa-SP"},{ref:182,rodada:4,data:"25/04",dia:"sáb",hora:"16:00",grupo:12,casa:"Madureira",fora:"America-RJ"},{ref:183,rodada:4,data:"25/04",dia:"sáb",hora:"19:00",grupo:12,casa:"Portuguesa-RJ",fora:"Pouso Alegre"},{ref:184,rodada:4,data:"25/04",dia:"sáb",hora:"19:00",grupo:13,casa:"Sampaio Corrêa-RJ",fora:"Nova Iguaçu"},{ref:185,rodada:4,data:"25/04",dia:"sáb",hora:"19:00",grupo:13,casa:"Velo Clube",fora:"Noroeste"},{ref:186,rodada:4,data:"25/04",dia:"sáb",hora:"18:00",grupo:13,casa:"XV de Piracicaba",fora:"Maricá"},{ref:187,rodada:4,data:"25/04",dia:"sáb",hora:"16:00",grupo:14,casa:"Joinville",fora:"Santa Catarina"},{ref:188,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:14,casa:"Guarany de Bagé",fora:"São Luiz-RS"},{ref:189,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:14,casa:"FC Cascavel",fora:"Cianorte"},{ref:190,rodada:4,data:"25/04",dia:"sáb",hora:"17:00",grupo:15,casa:"Marcílio Dias",fora:"Blumenau"},{ref:191,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:15,casa:"São José-RS",fora:"Brasil-RS"},{ref:192,rodada:4,data:"26/04",dia:"dom",hora:"16:00",grupo:15,casa:"Azuriz",fora:"São Joseense"},{ref:193,rodada:5,data:"03/05",dia:"dom",hora:"17:00",grupo:0,casa:"Nacional-AM",fora:"São Raimundo-RR"},{ref:194,rodada:5,data:"04/05",dia:"seg",hora:"20:00",grupo:0,casa:"GAS",fora:"Manauara"},{ref:195,rodada:5,data:"03/05",dia:"dom",hora:"18:00",grupo:0,casa:"Monte Roraima",fora:"Manaus"},{ref:196,rodada:5,data:"03/05",dia:"dom",hora:"16:00",grupo:1,casa:"Araguaína",fora:"Humaitá"},{ref:197,rodada:5,data:"02/05",dia:"sáb",hora:"20:00",grupo:1,casa:"Independência",fora:"Porto Velho"},{ref:198,rodada:5,data:"03/05",dia:"dom",hora:"18:00",grupo:1,casa:"Galvez",fora:"Guaporé"},{ref:199,rodada:5,data:"03/05",dia:"dom",hora:"17:00",grupo:2,casa:"Primavera",fora:"Inhumas"},{ref:200,rodada:5,data:"02/05",dia:"sáb",hora:"19:30",grupo:2,casa:"Gama",fora:"Luverdense"},{ref:201,rodada:5,data:"03/05",dia:"dom",hora:"16:00",grupo:2,casa:"Brasiliense",fora:"Aparecidense"},{ref:202,rodada:5,data:"02/05",dia:"sáb",hora:"18:30",grupo:3,casa:"Goiatuba",fora:"União-MT"},{ref:203,rodada:5,data:"03/05",dia:"dom",hora:"18:00",grupo:3,casa:"Mixto",fora:"Capital"},{ref:204,rodada:5,data:"03/05",dia:"dom",hora:"17:00",grupo:3,casa:"Operário-MT",fora:"Ceilândia"},{ref:205,rodada:5,data:"02/05",dia:"sáb",hora:"18:00",grupo:4,casa:"Tocantinópolis",fora:"Tuna Luso"},{ref:206,rodada:5,data:"04/05",dia:"seg",hora:"20:00",grupo:4,casa:"Trem",fora:"Imperatriz"},{ref:207,rodada:5,data:"03/05",dia:"dom",hora:"15:30",grupo:4,casa:"Oratório",fora:"Águia de Marabá"},{ref:208,rodada:5,data:"03/05",dia:"dom",hora:"16:00",grupo:5,casa:"Parnahyba",fora:"IAPE"},{ref:209,rodada:5,data:"03/05",dia:"dom",hora:"17:00",grupo:5,casa:"Sampaio Corrêa",fora:"Maracanã"},{ref:210,rodada:5,data:"02/05",dia:"sáb",hora:"17:00",grupo:5,casa:"Moto Club",fora:"Iguatu"},{ref:211,rodada:5,data:"02/05",dia:"sáb",hora:"16:00",grupo:6,casa:"Altos",fora:"Tirol"},{ref:212,rodada:5,data:"03/05",dia:"dom",hora:"17:00",grupo:6,casa:"Ferroviário",fora:"Piauí"},{ref:213,rodada:5,data:"02/05",dia:"sáb",hora:"16:00",grupo:6,casa:"Atlético-CE",fora:"Fluminense-PI"},{ref:214,rodada:5,data:"03/05",dia:"dom",hora:"16:00",grupo:7,casa:"Sousa",fora:"Laguna"},{ref:215,rodada:5,data:"02/05",dia:"sáb",hora:"16:00",grupo:7,casa:"ABC",fora:"Central"},{ref:216,rodada:5,data:"01/05",dia:"sex",hora:"20:00",grupo:7,casa:"América-RN",fora:"Maguary"},{ref:217,rodada:5,data:"02/05",dia:"sáb",hora:"18:00",grupo:8,casa:"Lagarto",fora:"Serra Branca"},{ref:218,rodada:5,data:"03/05",dia:"dom",hora:"17:30",grupo:8,casa:"Retrô",fora:"Sergipe"},{ref:219,rodada:5,data:"03/05",dia:"dom",hora:"16:00",grupo:8,casa:"Decisão",fora:"Treze"},{ref:220,rodada:5,data:"03/05",dia:"dom",hora:"16:00",grupo:9,casa:"Atlético-BA",fora:"ASA"},{ref:221,rodada:5,data:"03/05",dia:"dom",hora:"16:00",grupo:9,casa:"CSE",fora:"Jacuipense"},{ref:222,rodada:5,data:"02/05",dia:"sáb",hora:"16:00",grupo:9,casa:"CSA",fora:"Juazeirense"},{ref:223,rodada:5,data:"02/05",dia:"sáb",hora:"17:00",grupo:10,casa:"Uberlândia",fora:"Operário-MS"},{ref:224,rodada:5,data:"03/05",dia:"dom",hora:"16:00",grupo:10,casa:"CRAC",fora:"Betim"},{ref:225,rodada:5,data:"02/05",dia:"sáb",hora:"16:00",grupo:10,casa:"ABECAT",fora:"Ivinhema"},{ref:226,rodada:5,data:"02/05",dia:"sáb",hora:"17:00",grupo:11,casa:"Real Noroeste",fora:"Porto"},{ref:227,rodada:5,data:"03/05",dia:"dom",hora:"18:00",grupo:11,casa:"Tombense",fora:"Rio Branco-ES"},{ref:228,rodada:5,data:"04/05",dia:"seg",hora:"20:30",grupo:11,casa:"Democrata GV",fora:"Vitória-ES"},{ref:229,rodada:5,data:"02/05",dia:"sáb",hora:"15:00",grupo:12,casa:"America-RJ",fora:"Pouso Alegre"},{ref:230,rodada:5,data:"02/05",dia:"sáb",hora:"16:00",grupo:12,casa:"Portuguesa-SP",fora:"Madureira"},{ref:231,rodada:5,data:"02/05",dia:"sáb",hora:"16:00",grupo:12,casa:"Água Santa",fora:"Portuguesa-RJ"},{ref:232,rodada:5,data:"02/05",dia:"sáb",hora:"18:00",grupo:13,casa:"Noroeste",fora:"Maricá"},{ref:233,rodada:5,data:"03/05",dia:"dom",hora:"16:00",grupo:13,casa:"Nova Iguaçu",fora:"Velo Clube"},{ref:234,rodada:5,data:"02/05",dia:"sáb",hora:"19:00",grupo:13,casa:"Sampaio Corrêa-RJ",fora:"XV de Piracicaba"},{ref:235,rodada:5,data:"03/05",dia:"dom",hora:"16:00",grupo:14,casa:"São Luiz-RS",fora:"Cianorte"},{ref:236,rodada:5,data:"02/05",dia:"sáb",hora:"15:00",grupo:14,casa:"Santa Catarina",fora:"Guarany de Bagé"},{ref:237,rodada:5,data:"02/05",dia:"sáb",hora:"16:00",grupo:14,casa:"Joinville",fora:"FC Cascavel"},{ref:238,rodada:5,data:"02/05",dia:"sáb",hora:"19:00",grupo:15,casa:"Azuriz",fora:"São José-RS"},{ref:239,rodada:5,data:"02/05",dia:"sáb",hora:"18:00",grupo:15,casa:"Brasil-RS",fora:"Marcílio Dias"},{ref:240,rodada:5,data:"02/05",dia:"sáb",hora:"17:00",grupo:15,casa:"São Joseense",fora:"Blumenau"},{ref:241,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:0,casa:"São Raimundo-RR",fora:"Nacional-AM"},{ref:242,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:0,casa:"Manauara",fora:"GAS"},{ref:243,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:0,casa:"Manaus",fora:"Monte Roraima"},{ref:244,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:1,casa:"Humaitá",fora:"Araguaína"},{ref:245,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:1,casa:"Porto Velho",fora:"Independência"},{ref:246,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:1,casa:"Guaporé",fora:"Galvez"},{ref:247,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:2,casa:"Inhumas",fora:"Primavera"},{ref:248,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:2,casa:"Luverdense",fora:"Gama"},{ref:249,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:2,casa:"Aparecidense",fora:"Brasiliense"},{ref:250,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:3,casa:"União-MT",fora:"Goiatuba"},{ref:251,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:3,casa:"Capital",fora:"Mixto"},{ref:252,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:3,casa:"Ceilândia",fora:"Operário-MT"},{ref:253,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:4,casa:"Tuna Luso",fora:"Tocantinópolis"},{ref:254,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:4,casa:"Imperatriz",fora:"Trem"},{ref:255,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:4,casa:"Águia de Marabá",fora:"Oratório"},{ref:256,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:5,casa:"IAPE",fora:"Parnahyba"},{ref:257,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:5,casa:"Maracanã",fora:"Sampaio Corrêa"},{ref:258,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:5,casa:"Iguatu",fora:"Moto Club"},{ref:259,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:6,casa:"Tirol",fora:"Altos"},{ref:260,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:6,casa:"Piauí",fora:"Ferroviário"},{ref:261,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:6,casa:"Fluminense-PI",fora:"Atlético-CE"},{ref:262,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:7,casa:"Laguna",fora:"Sousa"},{ref:263,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:7,casa:"Central",fora:"ABC"},{ref:264,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:7,casa:"Maguary",fora:"América-RN"},{ref:265,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:8,casa:"Serra Branca",fora:"Lagarto"},{ref:266,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:8,casa:"Sergipe",fora:"Retrô"},{ref:267,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:8,casa:"Treze",fora:"Decisão"},{ref:268,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:9,casa:"ASA",fora:"Atlético-BA"},{ref:269,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:9,casa:"Jacuipense",fora:"CSE"},{ref:270,rodada:6,data:"10/05",dia:"dom",hora:"15:30",grupo:9,casa:"Juazeirense",fora:"CSA"},{ref:271,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:10,casa:"Operário-MS",fora:"Uberlândia"},{ref:272,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:10,casa:"Betim",fora:"CRAC"},{ref:273,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:10,casa:"Ivinhema",fora:"ABECAT"},{ref:274,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:11,casa:"Porto",fora:"Real Noroeste"},{ref:275,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:11,casa:"Rio Branco-ES",fora:"Tombense"},{ref:276,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:11,casa:"Vitória-ES",fora:"Democrata GV"},{ref:277,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:12,casa:"Pouso Alegre",fora:"America-RJ"},{ref:278,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:12,casa:"Madureira",fora:"Portuguesa-SP"},{ref:279,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:12,casa:"Portuguesa-RJ",fora:"Água Santa"},{ref:280,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:13,casa:"Maricá",fora:"Noroeste"},{ref:281,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:13,casa:"Velo Clube",fora:"Nova Iguaçu"},{ref:282,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:13,casa:"XV de Piracicaba",fora:"Sampaio Corrêa-RJ"},{ref:283,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:14,casa:"Cianorte",fora:"São Luiz-RS"},{ref:284,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:14,casa:"Guarany de Bagé",fora:"Santa Catarina"},{ref:285,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:14,casa:"FC Cascavel",fora:"Joinville"},{ref:286,rodada:6,data:"09/05",dia:"sáb",hora:"16:00",grupo:15,casa:"São José-RS",fora:"Azuriz"},{ref:287,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:15,casa:"Marcílio Dias",fora:"Brasil-RS"},{ref:288,rodada:6,data:"10/05",dia:"dom",hora:"16:00",grupo:15,casa:"Blumenau",fora:"São Joseense"},{ref:289,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:0,casa:"GAS",fora:"Monte Roraima"},{ref:290,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:0,casa:"Nacional-AM",fora:"Manauara"},{ref:291,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:0,casa:"São Raimundo-RR",fora:"Manaus"},{ref:292,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:1,casa:"Independência",fora:"Araguaína"},{ref:293,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:1,casa:"Galvez",fora:"Humaitá"},{ref:294,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:1,casa:"Porto Velho",fora:"Guaporé"},{ref:295,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:2,casa:"Gama",fora:"Brasiliense"},{ref:296,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:2,casa:"Primavera",fora:"Luverdense"},{ref:297,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:2,casa:"Inhumas",fora:"Aparecidense"},{ref:298,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:3,casa:"Mixto",fora:"Goiatuba"},{ref:299,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:3,casa:"Operário-MT",fora:"União-MT"},{ref:300,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:3,casa:"Capital",fora:"Ceilândia"},{ref:301,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:4,casa:"Trem",fora:"Oratório"},{ref:302,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:4,casa:"Tocantinópolis",fora:"Imperatriz"},{ref:303,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:4,casa:"Tuna Luso",fora:"Águia de Marabá"},{ref:304,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:5,casa:"Sampaio Corrêa",fora:"Parnahyba"},{ref:305,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:5,casa:"Moto Club",fora:"IAPE"},{ref:306,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:5,casa:"Maracanã",fora:"Iguatu"},{ref:307,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:6,casa:"Ferroviário",fora:"Atlético-CE"},{ref:308,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:6,casa:"Altos",fora:"Piauí"},{ref:309,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:6,casa:"Tirol",fora:"Fluminense-PI"},{ref:310,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:7,casa:"ABC",fora:"Sousa"},{ref:311,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:7,casa:"América-RN",fora:"Laguna"},{ref:312,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:7,casa:"Central",fora:"Maguary"},{ref:313,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:8,casa:"Retrô",fora:"Decisão"},{ref:314,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:8,casa:"Lagarto",fora:"Sergipe"},{ref:315,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:8,casa:"Serra Branca",fora:"Treze"},{ref:316,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:9,casa:"CSE",fora:"CSA"},{ref:317,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:9,casa:"Atlético-BA",fora:"Jacuipense"},{ref:318,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:9,casa:"ASA",fora:"Juazeirense"},{ref:319,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:10,casa:"CRAC",fora:"ABECAT"},{ref:320,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:10,casa:"Uberlândia",fora:"Betim"},{ref:321,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:10,casa:"Operário-MS",fora:"Ivinhema"},{ref:322,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:11,casa:"Tombense",fora:"Democrata GV"},{ref:323,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:11,casa:"Real Noroeste",fora:"Rio Branco-ES"},{ref:324,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:11,casa:"Porto",fora:"Vitória-ES"},{ref:325,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:12,casa:"Portuguesa-SP",fora:"Água Santa"},{ref:326,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:12,casa:"America-RJ",fora:"Madureira"},{ref:327,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:12,casa:"Pouso Alegre",fora:"Portuguesa-RJ"},{ref:328,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:13,casa:"Nova Iguaçu",fora:"Sampaio Corrêa-RJ"},{ref:329,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:13,casa:"Noroeste",fora:"Velo Clube"},{ref:330,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:13,casa:"Maricá",fora:"XV de Piracicaba"},{ref:331,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:14,casa:"Santa Catarina",fora:"Joinville"},{ref:332,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:14,casa:"São Luiz-RS",fora:"Guarany de Bagé"},{ref:333,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:14,casa:"Cianorte",fora:"FC Cascavel"},{ref:334,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:15,casa:"Blumenau",fora:"Marcílio Dias"},{ref:335,rodada:7,data:"16/05",dia:"sáb",hora:"16:00",grupo:15,casa:"Brasil-RS",fora:"São José-RS"},{ref:336,rodada:7,data:"17/05",dia:"dom",hora:"16:00",grupo:15,casa:"São Joseense",fora:"Azuriz"},{ref:337,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:0,casa:"GAS",fora:"Nacional-AM"},{ref:338,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:0,casa:"Monte Roraima",fora:"São Raimundo-RR"},{ref:339,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:0,casa:"Manauara",fora:"Manaus"},{ref:340,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:1,casa:"Independência",fora:"Galvez"},{ref:341,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:1,casa:"Araguaína",fora:"Porto Velho"},{ref:342,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:1,casa:"Humaitá",fora:"Guaporé"},{ref:343,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:2,casa:"Gama",fora:"Primavera"},{ref:344,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:2,casa:"Brasiliense",fora:"Inhumas"},{ref:345,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:2,casa:"Luverdense",fora:"Aparecidense"},{ref:346,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:3,casa:"Mixto",fora:"Operário-MT"},{ref:347,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:3,casa:"Goiatuba",fora:"Capital"},{ref:348,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:3,casa:"União-MT",fora:"Ceilândia"},{ref:349,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:4,casa:"Trem",fora:"Tocantinópolis"},{ref:350,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:4,casa:"Oratório",fora:"Tuna Luso"},{ref:351,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:4,casa:"Imperatriz",fora:"Águia de Marabá"},{ref:352,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:5,casa:"Sampaio Corrêa",fora:"Moto Club"},{ref:353,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:5,casa:"Parnahyba",fora:"Maracanã"},{ref:354,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:5,casa:"IAPE",fora:"Iguatu"},{ref:355,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:6,casa:"Ferroviário",fora:"Altos"},{ref:356,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:6,casa:"Atlético-CE",fora:"Tirol"},{ref:357,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:6,casa:"Piauí",fora:"Fluminense-PI"},{ref:358,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:7,casa:"ABC",fora:"América-RN"},{ref:359,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:7,casa:"Sousa",fora:"Central"},{ref:360,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:7,casa:"Laguna",fora:"Maguary"},{ref:361,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:8,casa:"Retrô",fora:"Lagarto"},{ref:362,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:8,casa:"Decisão",fora:"Serra Branca"},{ref:363,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:8,casa:"Sergipe",fora:"Treze"},{ref:364,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:9,casa:"CSE",fora:"Atlético-BA"},{ref:365,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:9,casa:"CSA",fora:"ASA"},{ref:366,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:9,casa:"Jacuipense",fora:"Juazeirense"},{ref:367,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:10,casa:"CRAC",fora:"Uberlândia"},{ref:368,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:10,casa:"ABECAT",fora:"Operário-MS"},{ref:369,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:10,casa:"Betim",fora:"Ivinhema"},{ref:370,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:11,casa:"Tombense",fora:"Real Noroeste"},{ref:371,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:11,casa:"Democrata GV",fora:"Porto"},{ref:372,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:11,casa:"Rio Branco-ES",fora:"Vitória-ES"},{ref:373,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:12,casa:"Portuguesa-SP",fora:"America-RJ"},{ref:374,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:12,casa:"Água Santa",fora:"Pouso Alegre"},{ref:375,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:12,casa:"Madureira",fora:"Portuguesa-RJ"},{ref:376,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:13,casa:"Nova Iguaçu",fora:"Noroeste"},{ref:377,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:13,casa:"Sampaio Corrêa-RJ",fora:"Maricá"},{ref:378,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:13,casa:"Velo Clube",fora:"XV de Piracicaba"},{ref:379,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:14,casa:"Santa Catarina",fora:"São Luiz-RS"},{ref:380,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:14,casa:"Joinville",fora:"Cianorte"},{ref:381,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:14,casa:"Guarany de Bagé",fora:"FC Cascavel"},{ref:382,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:15,casa:"São José-RS",fora:"Marcílio Dias"},{ref:383,rodada:8,data:"23/05",dia:"sáb",hora:"16:00",grupo:15,casa:"Azuriz",fora:"Blumenau"},{ref:384,rodada:8,data:"24/05",dia:"dom",hora:"16:00",grupo:15,casa:"São Joseense",fora:"Brasil-RS"},{ref:385,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:0,casa:"Monte Roraima",fora:"Manauara"},{ref:386,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:0,casa:"São Raimundo-RR",fora:"GAS"},{ref:387,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:0,casa:"Manaus",fora:"Nacional-AM"},{ref:388,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:1,casa:"Galvez",fora:"Porto Velho"},{ref:389,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:1,casa:"Humaitá",fora:"Independência"},{ref:390,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:1,casa:"Guaporé",fora:"Araguaína"},{ref:391,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:2,casa:"Brasiliense",fora:"Luverdense"},{ref:392,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:2,casa:"Inhumas",fora:"Gama"},{ref:393,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:2,casa:"Aparecidense",fora:"Primavera"},{ref:394,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:3,casa:"Operário-MT",fora:"Capital"},{ref:395,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:3,casa:"União-MT",fora:"Mixto"},{ref:396,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:3,casa:"Ceilândia",fora:"Goiatuba"},{ref:397,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:4,casa:"Oratório",fora:"Imperatriz"},{ref:398,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:4,casa:"Tuna Luso",fora:"Trem"},{ref:399,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:4,casa:"Águia de Marabá",fora:"Tocantinópolis"},{ref:400,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:5,casa:"Moto Club",fora:"Maracanã"},{ref:401,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:5,casa:"IAPE",fora:"Sampaio Corrêa"},{ref:402,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:5,casa:"Iguatu",fora:"Parnahyba"},{ref:403,rodada:9,data:"01/06",dia:"seg",hora:"16:00",grupo:6,casa:"Atlético-CE",fora:"Piauí"},{ref:404,rodada:9,data:"01/06",dia:"seg",hora:"16:00",grupo:6,casa:"Tirol",fora:"Ferroviário"},{ref:405,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:6,casa:"Fluminense-PI",fora:"Altos"},{ref:406,rodada:9,data:"29/05",dia:"sex",hora:"16:00",grupo:7,casa:"América-RN",fora:"Central"},{ref:407,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:7,casa:"Laguna",fora:"ABC"},{ref:408,rodada:9,data:"01/06",dia:"seg",hora:"16:00",grupo:7,casa:"Maguary",fora:"Sousa"},{ref:409,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:8,casa:"Decisão",fora:"Sergipe"},{ref:410,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:8,casa:"Serra Branca",fora:"Retrô"},{ref:411,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:8,casa:"Treze",fora:"Lagarto"},{ref:412,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:9,casa:"CSA",fora:"Jacuipense"},{ref:413,rodada:9,data:"30/05",dia:"sáb",hora:"17:00",grupo:9,casa:"ASA",fora:"CSE"},{ref:414,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:9,casa:"Juazeirense",fora:"Atlético-BA"},{ref:415,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:10,casa:"ABECAT",fora:"Betim"},{ref:416,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:10,casa:"Operário-MS",fora:"CRAC"},{ref:417,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:10,casa:"Ivinhema",fora:"Uberlândia"},{ref:418,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:11,casa:"Democrata GV",fora:"Rio Branco-ES"},{ref:419,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:11,casa:"Porto",fora:"Tombense"},{ref:420,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:11,casa:"Vitória-ES",fora:"Real Noroeste"},{ref:421,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:12,casa:"Água Santa",fora:"Madureira"},{ref:422,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:12,casa:"Pouso Alegre",fora:"Portuguesa-SP"},{ref:423,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:12,casa:"Portuguesa-RJ",fora:"America-RJ"},{ref:424,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:13,casa:"Sampaio Corrêa-RJ",fora:"Velo Clube"},{ref:425,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:13,casa:"Maricá",fora:"Nova Iguaçu"},{ref:426,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:13,casa:"XV de Piracicaba",fora:"Noroeste"},{ref:427,rodada:9,data:"30/05",dia:"sáb",hora:"16:00",grupo:14,casa:"Joinville",fora:"Guarany de Bagé"},{ref:428,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:14,casa:"Cianorte",fora:"Santa Catarina"},{ref:429,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:14,casa:"FC Cascavel",fora:"São Luiz-RS"},{ref:430,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:15,casa:"Brasil-RS",fora:"Blumenau"},{ref:431,rodada:9,data:"01/06",dia:"seg",hora:"16:00",grupo:15,casa:"Marcílio Dias",fora:"Azuriz"},{ref:432,rodada:9,data:"31/05",dia:"dom",hora:"16:00",grupo:15,casa:"São José-RS",fora:"São Joseense"},{ref:433,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:0,casa:"GAS",fora:"Manaus"},{ref:434,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:0,casa:"Nacional-AM",fora:"Monte Roraima"},{ref:435,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:0,casa:"Manauara",fora:"São Raimundo-RR"},{ref:436,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:1,casa:"Independência",fora:"Guaporé"},{ref:437,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:1,casa:"Araguaína",fora:"Galvez"},{ref:438,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:1,casa:"Porto Velho",fora:"Humaitá"},{ref:439,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:2,casa:"Gama",fora:"Aparecidense"},{ref:440,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:2,casa:"Primavera",fora:"Brasiliense"},{ref:441,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:2,casa:"Luverdense",fora:"Inhumas"},{ref:442,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:3,casa:"Mixto",fora:"Ceilândia"},{ref:443,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:3,casa:"Goiatuba",fora:"Operário-MT"},{ref:444,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:3,casa:"Capital",fora:"União-MT"},{ref:445,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:4,casa:"Trem",fora:"Águia de Marabá"},{ref:446,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:4,casa:"Tocantinópolis",fora:"Oratório"},{ref:447,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:4,casa:"Imperatriz",fora:"Tuna Luso"},{ref:448,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:5,casa:"Sampaio Corrêa",fora:"Iguatu"},{ref:449,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:5,casa:"Parnahyba",fora:"Moto Club"},{ref:450,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:5,casa:"Maracanã",fora:"IAPE"},{ref:451,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:6,casa:"Ferroviário",fora:"Fluminense-PI"},{ref:452,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:6,casa:"Altos",fora:"Atlético-CE"},{ref:453,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:6,casa:"Piauí",fora:"Tirol"},{ref:454,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:7,casa:"ABC",fora:"Maguary"},{ref:455,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:7,casa:"Sousa",fora:"América-RN"},{ref:456,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:7,casa:"Central",fora:"Laguna"},{ref:457,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:8,casa:"Retrô",fora:"Treze"},{ref:458,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:8,casa:"Lagarto",fora:"Decisão"},{ref:459,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:8,casa:"Sergipe",fora:"Serra Branca"},{ref:460,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:9,casa:"CSE",fora:"Juazeirense"},{ref:461,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:9,casa:"Atlético-BA",fora:"CSA"},{ref:462,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:9,casa:"Jacuipense",fora:"ASA"},{ref:463,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:10,casa:"CRAC",fora:"Ivinhema"},{ref:464,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:10,casa:"Uberlândia",fora:"ABECAT"},{ref:465,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:10,casa:"Betim",fora:"Operário-MS"},{ref:466,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:11,casa:"Tombense",fora:"Vitória-ES"},{ref:467,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:11,casa:"Real Noroeste",fora:"Democrata GV"},{ref:468,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:11,casa:"Rio Branco-ES",fora:"Porto"},{ref:469,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:12,casa:"Portuguesa-SP",fora:"Portuguesa-RJ"},{ref:470,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:12,casa:"America-RJ",fora:"Água Santa"},{ref:471,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:12,casa:"Madureira",fora:"Pouso Alegre"},{ref:472,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:13,casa:"Nova Iguaçu",fora:"XV de Piracicaba"},{ref:473,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:13,casa:"Noroeste",fora:"Sampaio Corrêa-RJ"},{ref:474,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:13,casa:"Velo Clube",fora:"Maricá"},{ref:475,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:14,casa:"Santa Catarina",fora:"FC Cascavel"},{ref:476,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:14,casa:"São Luiz-RS",fora:"Joinville"},{ref:477,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:14,casa:"Guarany de Bagé",fora:"Cianorte"},{ref:478,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:15,casa:"São Joseense",fora:"Marcílio Dias"},{ref:479,rodada:10,data:"13/06",dia:"sáb",hora:"16:00",grupo:15,casa:"Blumenau",fora:"São José-RS"},{ref:480,rodada:10,data:"14/06",dia:"dom",hora:"16:00",grupo:15,casa:"Azuriz",fora:"Brasil-RS"}];

// === COPA DO BRASIL 2026 ===
// 32 times: 20 Série A (seeds 1-20) + 12 classificados divisões inferiores
// R32 ida/volta → R16 → Quartas → Semi → Final (jogo único neutro)
const CB_TEAMS=['Atlético-MG','Ceará','Goiás','Cruzeiro','Athletico-PR','Atlético-GO','Flamengo','Vitória','Grêmio','Confiança','Paysandu','Vasco','Fortaleza','CRB','Bahia','Remo','Botafogo','Chapecoense','Red Bull Bragantino','Mirassol','Barra-SC','Corinthians','Operário-PR','Fluminense','Palmeiras','Jacuipense','Athletic','Internacional','Santos','Coritiba','São Paulo','Juventude'];
const CB_ELOS={};CB_TEAMS.forEach(t=>{CB_ELOS[t]=(SA_RANKING[t]&&SA_RANKING[t].elo)||(SB_RANKING[t]&&SB_RANKING[t].elo)||(SC_RANKING[t]&&SC_RANKING[t].elo)||1200;});
CB_ELOS['Barra-SC']=1180;CB_ELOS['Jacuipense']=1180;
// R32: confrontos oficiais CBF 2026 (Equipe1 vs Equipe2)
const CB_R32=[[0,1],[2,3],[4,5],[6,7],[8,9],[10,11],[12,13],[14,15],[16,17],[18,19],[20,21],[22,23],[24,25],[26,27],[28,29],[30,31]];
// CB_RES_IDA: placares dos jogos de IDA da R32 (21-23/04/2026), 1 entrada por par
// na MESMA ordem de CB_R32. {ga,gb} = gols time-a (mandante ida) × time-b (visitante ida).
// Para o jogo de volta (12-14/05), o mando inverte. Quando volta tiver placar real,
// criar CB_RES_VOLTA na mesma estrutura. Ordem precisa bater com CB_R32 índice por índice.
const CB_RES_IDA=[
  {ga:2,gb:1}, // Atlético-MG × Ceará
  {ga:2,gb:2}, // Goiás × Cruzeiro
  {ga:0,gb:0}, // Athletico-PR × Atlético-GO
  {ga:2,gb:1}, // Flamengo × Vitória
  {ga:2,gb:0}, // Grêmio × Confiança
  {ga:0,gb:2}, // Paysandu × Vasco
  {ga:2,gb:1}, // Fortaleza × CRB
  {ga:1,gb:3}, // Bahia × Remo
  {ga:1,gb:0}, // Botafogo × Chapecoense
  {ga:1,gb:1}, // Red Bull Bragantino × Mirassol
  {ga:0,gb:1}, // Barra-SC × Corinthians
  {ga:0,gb:0}, // Operário-PR × Fluminense
  {ga:3,gb:0}, // Palmeiras × Jacuipense
  {ga:1,gb:2}, // Athletic × Internacional
  {ga:0,gb:0}, // Santos × Coritiba
  {ga:1,gb:0}, // São Paulo × Juventude
];
const CB_RES_VOLTA=[
  {ga:2,gb:1}, // Ceará × Atlético-MG (volta) — AGG 3-3, Atlético-MG via pênaltis 4-2
  {ga:1,gb:0}, // Cruzeiro × Goiás (volta) — Cruzeiro AGG 3-2
  {ga:0,gb:0}, // Atlético-GO × Athletico-PR (volta) — AGG 0-0, Athletico-PR via pênaltis 4-1
  {ga:2,gb:0}, // Vitória × Flamengo (volta) — Vitória AGG 3-2
  {ga:0,gb:3}, // Confiança × Grêmio (volta) — Grêmio AGG 5-0
  {ga:2,gb:2}, // Vasco × Paysandu (volta) — Vasco AGG 4-2
  {ga:0,gb:0}, // CRB × Fortaleza (volta) — Fortaleza AGG 2-1
  {ga:2,gb:1}, // Remo × Bahia (volta) — Remo AGG 5-2
  {ga:2,gb:0}, // Chapecoense × Botafogo (volta) — Chape AGG 2-1
  {ga:2,gb:1}, // Mirassol × Red Bull Bragantino (volta) — Mirassol AGG 3-2
  {ga:1,gb:0}, // Corinthians × Barra-SC (volta) — Corinthians AGG 2-0
  {ga:2,gb:1}, // Fluminense × Operário-PR (volta) — Fluminense AGG 2-1
  {ga:1,gb:4}, // Jacuipense × Palmeiras (volta) — Palmeiras AGG 7-1
  {ga:3,gb:2}, // Internacional × Athletic (volta) — Internacional AGG 5-3
  {ga:0,gb:2}, // Coritiba × Santos (volta) — Santos AGG 2-0
  {ga:3,gb:1}, // Juventude × São Paulo (volta) — Juventude AGG 3-2
];
// R16 (oitavas) — SORTEIO REAL já realizado (chaveamento fixo). team-a manda a ida,
// team-b manda a volta. Os 16 nomes conferem com os vencedores reais da R32.
const CB_R16_PAIRS=[
  ['Fluminense','Vasco'],      // volta no Rio de Janeiro
  ['Internacional','Corinthians'], // volta em São Paulo
  ['Mirassol','Grêmio'],       // volta no Rio Grande do Sul
  ['Athletico-PR','Vitória'],  // volta na Bahia
  ['Atlético-MG','Juventude'], // volta no Rio Grande do Sul
  ['Santos','Remo'],           // volta no Pará
  ['Chapecoense','Cruzeiro'],  // volta no Mineirão
  ['Palmeiras','Fortaleza'],   // volta no Ceará
];
const CB_R16_SET=new Set(CB_R16_PAIRS.reduce((a,p)=>a.concat(p),[]));
const shuffle=(arr)=>{const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const CB_ROUND_NAMES=['R32 (ida/volta)','R16 (definido)','Quartas (sorteio)','Semifinal (sorteio)','Final (jogo único)'];
const CB_DATES=['30/04','21/05','13/08','17/09','29/10'];

// ============================================================================
// COMPONENTES UI — helpers reutilizáveis
// ============================================================================

// Hook genérico de ordenação. Retorna {sorted, sort, toggle}.
// defaultKey opcional (ex.: 'elo'), dir default = 'desc' (maiores primeiro).
const useSortable=(data,defaultKey=null,defaultDir='desc')=>{
  const[sort,setSort]=useState({key:defaultKey,dir:defaultDir});
  const sorted=useMemo(()=>{
    if(!sort.key)return data;
    const arr=[...data];
    arr.sort((a,b)=>{
      const av=a[sort.key],bv=b[sort.key];
      if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return -1;
      if(typeof av==='string')return sort.dir==='asc'?av.localeCompare(bv):bv.localeCompare(av);
      return sort.dir==='asc'?av-bv:bv-av;
    });
    return arr;
  },[data,sort]);
  const toggle=(key)=>setSort(prev=>prev.key===key?{key,dir:prev.dir==='asc'?'desc':'asc'}:{key,dir:'desc'});
  return{sorted,sort,toggle};
};

// Header clicável para tabela ordenável. Mostra seta ↑/↓ quando ativo.
const SortHeader=({k,label,sort,onClick,align='left',className=''})=>{
  const a=align==='center'?'text-center':align==='right'?'text-right':'text-left';
  const active=sort.key===k;
  return(<th onClick={()=>onClick(k)} className={`${a} cursor-pointer select-none hover:text-white transition-colors ${active?'text-emerald-300':'text-slate-400'} ${className}`}>
    <span className="inline-flex items-center gap-0.5">{label}{active&&<span className="text-[9px]">{sort.dir==='asc'?'▲':'▼'}</span>}</span>
  </th>);
};

// Legenda de zonas (Libertadores/Sul-Americana/Rebaixamento etc).
// Reutilizada nas abas Classificação e Monte Carlo.
const ZonasLegend=({meta})=>{
  const z=meta.zonas;
  const items=[];
  if(z.g4L)items.push({c:'bg-blue-400',l:z.g4L});
  if(z.g6L)items.push({c:'bg-sky-500',l:z.g6L});
  if(z.g8L)items.push({c:'bg-teal-600',l:z.g8L});
  if(z.z4)items.push({c:'bg-red-500',l:`Rebaixamento (últimos ${meta.nReb||4})`});
  return(<div className="flex gap-3 mt-2 text-[11px] text-slate-400 flex-wrap">
    {items.map((it,i)=>(<span key={i} className="flex items-center gap-1.5"><span className={`w-3 h-3 ${it.c} rounded-sm shadow-sm`}></span>{it.l}</span>))}
  </div>);
};

// Filtra rows por nome (campo `time`). Match substring case-insensitive.
const filterByName=(rows,query)=>{if(!query)return rows;const q=query.trim().toLowerCase();return rows.filter(r=>String(r.time||'').toLowerCase().includes(q));};

// Exporta array de objetos como CSV e dispara download no navegador.
// `cols` é array de {label, key} ou {label, fn:(row)=>val}.
const exportCSV=(rows,cols,filename)=>{
  if(!rows.length)return;
  const esc=(v)=>{if(v==null)return'';const s=String(v).replace(/"/g,'""');return /[",\n]/.test(s)?`"${s}"`:s;};
  const header=cols.map(c=>c.label).join(',');
  const body=rows.map(r=>cols.map(c=>esc(typeof c.fn==='function'?c.fn(r):r[c.key])).join(',')).join('\n');
  const blob=new Blob([header+'\n'+body],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
};

// Barra compacta com busca + botão export. Reutilizada em tabelas principais.
const TableToolbar=({query,setQuery,onExport,showing,total,placeholder='Buscar time...'})=>(
  <div className="flex items-center gap-2 mb-2 flex-wrap">
    <input type="text" value={query} onChange={e=>setQuery(e.target.value)} placeholder={placeholder}
      className="flex-1 min-w-[140px] max-w-xs bg-slate-700/40 text-white text-xs rounded-lg px-2 py-1 border border-slate-600/50 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"/>
    <span className="text-[10px] text-slate-500 font-mono">{query?`${showing}/${total}`:`${total} times`}</span>
    {onExport&&<button onClick={onExport} title="Baixar CSV" className="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded border border-slate-600 transition-colors">📥 CSV</button>}
  </div>
);

// Mini-histograma inline. Recebe array de amostras (ex.: pontos finais do time).
// Renderiza SVG de ~64x16 px com bins normalizados, útil dentro de <td>.
// Calcula min/max de array sem usar spread (Math.min(...arr) estoura call stack
// em arrays com 100k+ elementos). Retorna {min, max} ou {min:0, max:1} se vazio.
const minMax=(arr)=>{if(!arr||!arr.length)return{min:0,max:1};let mn=arr[0],mx=arr[0];for(let i=1;i<arr.length;i++){const v=arr[i];if(v<mn)mn=v;else if(v>mx)mx=v;}return{min:mn,max:mx};};

const Sparkbar=({samples,bins=12,color='#10b981',width=64,height=16,globalMin,globalMax})=>{
  if(!samples||!samples.length)return null;
  const mm=(globalMin!==undefined&&globalMax!==undefined)?{min:globalMin,max:globalMax}:minMax(samples);
  const min=mm.min,max=mm.max;
  if(max<=min)return(<svg width={width} height={height}><rect x={width/2-1} y={height-height*0.8} width={2} height={height*0.8} fill={color}/></svg>);
  const counts=new Array(bins).fill(0);
  const step=(max-min)/bins;
  samples.forEach(v=>{let b=Math.floor((v-min)/step);if(b<0)b=0;if(b>=bins)b=bins-1;counts[b]++;});
  const peak=Math.max(...counts);if(peak===0)return null;
  const bw=width/bins;
  return(<svg width={width} height={height} className="inline-block align-middle" preserveAspectRatio="none">
    {counts.map((c,i)=>{const h=(c/peak)*height;return c>0?(<rect key={i} x={i*bw} y={height-h} width={bw-0.5} height={h} fill={color} opacity="0.8"/>):null;})}
  </svg>);
};

// Interpolador de cor para heatmap. Recebe 0..1 e retorna RGBA com escala
// perceptual: slate (baixo) → emerald intenso (alto). Usa curva quadrática
// para acentuar valores pequenos mas não-zero.
const heatColor=(t)=>{
  if(!t||t<=0)return 'transparent';
  const x=Math.min(1,Math.max(0,t));
  const alpha=0.05+0.9*Math.pow(x,0.7);
  const g=Math.round(185+(222-185)*x);
  const r=Math.round(50+(74-50)*(1-x*0.8));
  const b=Math.round(100+(128-100)*(1-x));
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
};

// Sparkline dos últimos N jogos de um time: quadrinhos coloridos V (verde),
// E (amarelo), D (vermelho). Ordem: mais antigo → mais recente.
const FormStreak=({results,max=5})=>{
  if(!results||!results.length)return(<span className="text-slate-600 text-[9px]">—</span>);
  const recent=results.slice(-max);
  return(<span className="inline-flex gap-0.5">{recent.map((r,i)=>{
    const c=r==='V'?'bg-green-500':r==='E'?'bg-yellow-500':'bg-red-500';
    return(<span key={i} className={`w-2.5 h-2.5 ${c} rounded-sm inline-block`} title={r==='V'?'Vitória':r==='E'?'Empate':'Derrota'}/>);
  })}</span>);
};

// Extrai resultados em ordem cronológica (por rodada) para cada time a partir
// de um array de resultados. Retorna {time: ['V','E','D',...]}.
const extractForm=(times,res)=>{
  const byTeam={};times.forEach(t=>byTeam[t]=[]);
  const sorted=[...res].sort((a,b)=>(a.r||0)-(b.r||0));
  for(const r of sorted){
    if(byTeam[r.c]!==undefined)byTeam[r.c].push(r.gc>r.gf?'V':r.gc===r.gf?'E':'D');
    if(byTeam[r.f]!==undefined)byTeam[r.f].push(r.gf>r.gc?'V':r.gc===r.gf?'E':'D');
  }
  return byTeam;
};

// Ícone "?" com tooltip ao passar o mouse. Usa atributo nativo title para
// acessibilidade + hover visual extra. Útil ao lado de parâmetros técnicos.
const InfoTooltip=({text})=>(
  <span className="inline-flex items-center justify-center w-3.5 h-3.5 ml-1 rounded-full bg-slate-700 text-slate-400 text-[9px] font-bold cursor-help hover:bg-slate-600 hover:text-white transition-colors align-middle" title={text}>?</span>
);

// Visão de "cruzamentos mais prováveis" para uma série com fases de mata-mata.
// Para cada time, mostra top-N adversários mais frequentes em cada fase, com %.
// Só mostra fases onde o time tem probabilidade > probFloor de aparecer.
// Props:
//   probs: array de times com .matchups[fase] = [{adv, pct, count}] ordenado desc
//   phases: [{key, label, probKey?}, ...] onde probKey é o campo de probabilidade
//           de chegar à fase (ex.: 'qf', 'sf'). Se omitido, sempre mostra.
//   topN: quantos adversários mostrar por fase (default 3)
//   probFloor: só mostra fase se p[probKey] >= probFloor (default 2)
const MatchupsView=({probs,phases,topN=3,probFloor=2,sortKey})=>{
  const[qM,setQM]=useState('');
  const sorted=useMemo(()=>{
    const arr=[...probs];
    if(sortKey)arr.sort((a,b)=>(b[sortKey]||0)-(a[sortKey]||0));
    return arr;
  },[probs,sortKey]);
  const filtered=useMemo(()=>filterByName(sorted,qM),[sorted,qM]);
  return(<div>
    <TableToolbar query={qM} setQuery={setQM} showing={filtered.length} total={sorted.length}/>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
      {filtered.map(p=>(
        <div key={p.time} className="bg-slate-900/40 rounded-xl p-3 border border-slate-700/40">
          <div className="flex items-baseline justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-100"><TN name={p.time}/></h4>
            {sortKey&&<span className="text-[10px] text-slate-500 font-mono">{(p[sortKey]||0).toFixed(1)}%</span>}
          </div>
          <div className="space-y-1.5">
            {phases.map(phase=>{
              const prob=phase.probKey?(p[phase.probKey]||0):100;
              if(prob<probFloor)return null;
              const mu=p.matchups?.[phase.key]||[];
              if(mu.length===0)return null;
              const top=mu.slice(0,topN);
              return(
                <div key={phase.key} className="flex items-baseline gap-2 text-[11px]">
                  <span className="text-emerald-400 font-semibold w-14 flex-shrink-0">{phase.label}</span>
                  {phase.probKey&&<span className="text-[9px] text-slate-600 font-mono w-8 flex-shrink-0">{Math.round(prob)}%</span>}
                  <span className="flex-1 min-w-0 flex flex-wrap gap-x-2 gap-y-0.5">{top.map((m,i)=>(
                    <span key={i} className="text-slate-300"><TN name={m.adv}/> <span className="text-slate-500 font-mono">{Math.round(m.pct)}%</span></span>
                  ))}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
    <p className="text-[10px] text-slate-500 mt-3 italic">Para cada fase de mata-mata, os {topN} adversários mais prováveis (% = entre as vezes em que o time chegou à fase). Fases só aparecem se o time chegar a elas em ≥{probFloor}% das simulações.</p>
  </div>);
};


const GameRow=({j,real,prob,isUser,onScore})=>{const hasScore=real||j.gc!==undefined;const gc=real?real.gc:j.gc;const gf=real?real.gf:j.gf;
  const[eGC,setEGC]=useState(null);const[eGF,setEGF]=useState(null);
  const Stepper=({val,onChange})=>(<span className="inline-flex items-center gap-0.5">
    <button onClick={()=>onChange(Math.max(0,(val||0)-1))} className="w-5 h-5 bg-slate-600 rounded text-[10px] hover:bg-slate-500 leading-none">−</button>
    <input type="number" min="0" max="20" value={val===null||val===undefined?'':val} onChange={e=>{const v=e.target.value;onChange(v===''?null:Math.max(0,parseInt(v)||0));}}
      className="w-7 h-5 bg-slate-700 text-center text-xs rounded border border-slate-600 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>
    <button onClick={()=>onChange((val||0)+1)} className="w-5 h-5 bg-slate-600 rounded text-[10px] hover:bg-slate-500 leading-none">+</button>
  </span>);
  if(!hasScore&&onScore){
    return(<div className="flex items-center justify-between p-1.5 rounded text-xs bg-slate-700/30 gap-1">
      {j.data&&<span className="text-slate-600 w-12 text-[10px]">{j.data}</span>}
      <span className="text-slate-500 w-6 text-right font-mono">R{j.rodada}</span>
      {prob&&<span className="text-blue-400 w-7 text-right text-[10px] font-mono">{Math.round(prob.pH)}%</span>}
      <span className="flex-1 text-right truncate pr-1 text-[11px]"><TN name={j.casa}/></span>
      <Stepper val={eGC} onChange={v=>{setEGC(v);if(v!==null&&eGF!==null)onScore(j.casa,j.fora,j.rodada,v,eGF);}}/>
      <span className="text-slate-500 text-[10px]">x</span>
      <Stepper val={eGF} onChange={v=>{setEGF(v);if(eGC!==null&&v!==null)onScore(j.casa,j.fora,j.rodada,eGC,v);}}/>
      <span className="flex-1 truncate pl-1 text-[11px]"><TN name={j.fora}/></span>
      {prob&&<span className="text-orange-400 w-7 text-[10px] font-mono">{Math.round(prob.pA)}%</span>}
    </div>);
  }
  return(<div className={`flex items-center justify-between p-1.5 rounded text-xs ${isUser?'bg-amber-900/20 border-l-2 border-amber-400':(real||j.real)?'bg-emerald-900/20 border-l-2 border-emerald-500':hasScore?'bg-slate-700/20 border-l-2 border-slate-600':'bg-slate-700/30'}`}>
    {j.data&&<span className="text-slate-600 w-12 text-[10px]">{j.data}</span>}
    <span className="text-slate-500 w-6 text-right font-mono">R{j.rodada}</span>
    {prob&&!hasScore&&<span className="text-blue-400 w-7 text-right text-[10px] font-mono">{Math.round(prob.pH)}%</span>}
    <span className="flex-1 text-right truncate pr-1"><TN name={j.casa}/></span>
    {hasScore?<span className={`mx-1 font-mono font-bold w-12 text-center ${gc>gf?'text-emerald-400':gc<gf?'text-red-400':'text-yellow-400'}`}>{gc} x {gf}</span>:<span className="mx-1 w-12 text-center text-slate-600">{prob?Math.round(prob.pD)+'%':'vs'}</span>}
    <span className="flex-1 truncate pl-1"><TN name={j.fora}/></span>
    {prob&&!hasScore&&<span className="text-orange-400 w-7 text-[10px] font-mono">{Math.round(prob.pA)}%</span>}
    {(real||j.real)&&<span className="ml-1 text-emerald-400 text-[10px]">✓</span>}
    {isUser&&onScore&&<button onClick={()=>onScore(j.casa,j.fora,j.rodada,null,null)} className="ml-1 text-red-400 text-[10px] hover:text-red-300">✕</button>}
  </div>);};

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================
function UpdaterPanel({onResults,fetchedRes,onClear}){
  // API key: 1) injetada no build (window.__ANTHROPIC_API_KEY__, ex. via segredo do GitHub),
  // 2) salva neste navegador (localStorage), 3) digitada à mão. A digitada fica salva.
  const injected=(typeof window!=='undefined'&&window.__ANTHROPIC_API_KEY__&&window.__ANTHROPIC_API_KEY__.indexOf('__')!==0)?window.__ANTHROPIC_API_KEY__:'';
  const[link,setLink]=useState('');
  const[apiKey,setApiKey]=useState(()=>{if(injected)return injected;try{return localStorage.getItem('simUni_apiKey')||'';}catch(e){return '';}});
  const[busy,setBusy]=useState(false);const[status,setStatus]=useState('');const[jsonText,setJsonText]=useState('');
  useEffect(()=>{if(!injected){try{if(apiKey)localStorage.setItem('simUni_apiKey',apiKey);}catch(e){}}},[apiKey,injected]);
  const total=fetchedRes.A.length+fetchedRes.B.length+fetchedRes.C.length+(fetchedRes.D?fetchedRes.D.length:0);
  const b64=(buf)=>{let bin='';const bytes=new Uint8Array(buf),chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)bin+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunk));return btoa(bin);};
  const buscarLink=async()=>{
    if(!link.trim()){setStatus('Cole o link do PDF da CBF primeiro.');return;}
    setBusy(true);setStatus('Baixando o PDF (via proxy)…');
    try{
      const prox='https://api.allorigins.win/raw?url='+encodeURIComponent(link.trim());
      const r=await fetch(prox);if(!r.ok)throw new Error('proxy '+r.status);
      const buf=await r.arrayBuffer();if(buf.byteLength<1000)throw new Error('PDF vazio ou bloqueado');
      setStatus('Lendo o PDF com o Claude…');
      const prompt='Este PDF é a Tabela Detalhada da CBF de uma série do Brasileirão 2026 (A, B, C ou D — veja o cabeçalho). Extraia TODOS os jogos que JÁ têm placar (finalizados). Retorne SOMENTE um array JSON, nada mais: [{"serie":"A","rodada":18,"casa":"Flamengo","gc":3,"gf":0,"fora":"Coritiba"}]. Use nomes oficiais com sufixo de UF quando houver (Atlético-MG, Athletico-PR, Operário-PR, Botafogo-SP, Botafogo-PB, São Paulo, São Bernardo, Red Bull Bragantino, Ponte Preta, Vila Nova, etc.). Para a Série D, use exatamente os nomes que aparecem no PDF.';
      const body={model:'claude-sonnet-4-20250514',max_tokens:16000,messages:[{role:'user',content:[{type:'document',source:{type:'base64',media_type:'application/pdf',data:b64(buf)}},{type:'text',text:prompt}]}]};
      const headers={'Content-Type':'application/json'};if(apiKey)headers['x-api-key']=apiKey;
      const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers,body:JSON.stringify(body)});
      if(!resp.ok){if(resp.status===401||resp.status===403){setStatus('Precisa da API key da Anthropic (campo acima).');setBusy(false);return;}throw new Error('API '+resp.status);}
      const d=await resp.json();let txt='';for(const bl of (d.content||[]))if(bl.type==='text')txt+=bl.text;
      txt=txt.replace(/```json\s*/g,'').replace(/```/g,'').trim();
      let arr=[];try{arr=JSON.parse(txt);}catch(e){const m=txt.match(/\[[\s\S]*\]/);if(m)try{arr=JSON.parse(m[0]);}catch(e2){}}
      if(!Array.isArray(arr)||!arr.length){setStatus('Nenhum jogo lido do PDF. Tente o modo manual abaixo.');setBusy(false);return;}
      onResults(arr);setStatus('✅ '+arr.length+' jogo(s) lidos — os inéditos foram mesclados e salvos.');
    }catch(e){setStatus('Falhou ('+e.message+'). Use "Copiar prompt" e o modo manual abaixo.');}
    setBusy(false);
  };
  const aplicarJSON=()=>{try{const arr=JSON.parse(jsonText);if(!Array.isArray(arr))throw 0;onResults(arr);setStatus('✅ '+arr.length+' resultado(s) aplicados e salvos.');setJsonText('');}catch(e){setStatus('JSON inválido.');}};
  const copiarPrompt=()=>{const t='Atualize o simulador com este link da Tabela Detalhada da CBF: '+(link.trim()||'<cole o link aqui>')+'\n\nLeia os jogos com placar e me devolva SOMENTE um array JSON no formato [{"serie":"A","rodada":18,"casa":"...","gc":0,"gf":0,"fora":"..."}] com os jogos que ainda não estão no simulador.';if(navigator.clipboard)navigator.clipboard.writeText(t);setStatus('Prompt copiado — cole numa conversa comigo, e depois cole o JSON de volta no modo manual.');};
  return(<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50 space-y-2">
    <h3 className="text-sm font-bold text-emerald-300">Atualizar resultados via link (A/B/C/D)</h3>
    <p className="text-[11px] text-slate-500">Cole o link da Tabela Detalhada (CBF) e busque os jogos novos. Usa sua API key da Anthropic + um proxy público para ler o PDF; os jogos ficam salvos neste navegador. Para a Série D (PDF grande) a leitura pode vir incompleta — nesse caso use "Copiar prompt" → me mande → cole o JSON no modo manual.</p>
    <input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://…/Tabela_Detalhada_…pdf" className="w-full bg-slate-700 text-white text-xs rounded-lg px-3 py-2 border border-slate-600"/>
    {injected?<p className="text-[11px] text-emerald-400/80">🔑 API key carregada do build.</p>:<input value={apiKey} onChange={e=>setApiKey(e.target.value)} type="password" placeholder="API key (sk-ant-…) — salva só neste navegador" className="w-full bg-slate-700 text-white text-xs rounded-lg px-3 py-2 border border-slate-600"/>}
    <div className="flex gap-2">
      <button onClick={buscarLink} disabled={busy} className="flex-1 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-lg font-semibold text-xs disabled:opacity-50">{busy?'Processando…':'Buscar jogos do link'}</button>
      <button onClick={copiarPrompt} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs text-slate-300 whitespace-nowrap">Copiar prompt</button>
    </div>
    {status&&<p className="text-[11px] text-slate-300 bg-slate-900/50 rounded px-2 py-1">{status}</p>}
    <details className="text-[11px]"><summary className="text-slate-400 cursor-pointer">Modo manual — colar JSON</summary>
      <textarea value={jsonText} onChange={e=>setJsonText(e.target.value)} rows={4} placeholder='[{"serie":"A","rodada":18,"casa":"Flamengo","gc":3,"gf":0,"fora":"Coritiba"}]' className="w-full mt-2 bg-slate-700 text-white text-[11px] font-mono rounded-lg px-2 py-1.5 border border-slate-600"/>
      <button onClick={aplicarJSON} className="mt-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded-lg text-xs">Aplicar JSON</button>
    </details>
    {total>0&&<div className="flex items-center justify-between bg-emerald-900/20 rounded-lg p-2 border border-emerald-600/30"><span className="text-xs text-emerald-300">{total} resultado(s) extra(s) salvos (A:{fetchedRes.A.length} B:{fetchedRes.B.length} C:{fetchedRes.C.length} D:{fetchedRes.D?fetchedRes.D.length:0})</span><button onClick={onClear} className="text-xs text-red-400 hover:text-red-300">Limpar</button></div>}
  </div>);
}

function SettingsTab({cfg,setCfg,dataHealth,fixtureCheck,onResults,fetchedRes,onClearFetched}){
  const upd=(path,val)=>{setCfg(prev=>{const n=JSON.parse(JSON.stringify(prev));const p=path.split('.');let o=n;for(let i=0;i<p.length-1;i++)o=o[p[i]];o[p[p.length-1]]=isNaN(Number(val))?val:Number(val);return n;});};
  const Inp=({label,path,step=0.01})=>(<div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-400">{label}</span><input type="number" step={step} value={path.split('.').reduce((o,k)=>o[k],cfg)} onChange={e=>upd(path,e.target.value)} className="w-20 bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600 text-right"/></div>);
  const[showMisses,setShowMisses]=useState(false);
  const SerieRow=({s,r})=>{const pct=r.total?(r.matched/r.total*100):100;const ok=r.matched===r.total;return(<div className="flex items-center gap-3 py-1.5 border-b border-slate-700/30 last:border-b-0"><span className="text-xs font-bold text-slate-300 w-16">{`Série ${s}`}</span><span className={`text-xs font-mono ${ok?'text-green-400':'text-amber-400'}`}>{r.matched}/{r.total}</span><span className="text-[10px] text-slate-500 font-mono">({pct.toFixed(0)}%)</span>{s==='D'&&r.matchedOld!==undefined&&<span className="text-[10px] text-slate-500 italic ml-2">v4.2 antigo: {r.matchedOld}/{r.total} ({(r.matchedOld/r.total*100).toFixed(0)}%)</span>}{ok?<span className="text-green-400 text-xs">✓</span>:<span className="text-amber-400 text-xs">⚠ {r.misses.length} miss{r.misses.length>1?'es':''}</span>}</div>);};
  const[sub,setSub]=useState('params');
  return(<div className="space-y-4">
    <div className="flex gap-1 bg-slate-800/40 rounded-xl p-1 max-w-xs">
      {[{id:'params',l:'Parâmetros'},{id:'calib',l:'Calibração'}].map(t=>(<button key={t.id} onClick={()=>setSub(t.id)} className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium ${sub===t.id?'bg-emerald-600/80 text-white shadow':'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>{t.l}</button>))}
    </div>
    {sub==='calib'&&<CalibSim cfg={cfg}/>}
    {sub==='params'&&<>
    {onResults&&<UpdaterPanel onResults={onResults} fetchedRes={fetchedRes||{A:[],B:[],C:[]}} onClear={onClearFetched}/>}
    <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50"><h3 className="text-sm font-bold text-emerald-300 mb-3">Motor Geral</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3"><Inp label="Target Ratio" path="targetRatio" step={0.1}/><Inp label="Home Adv" path="homeAdv" step={10}/><Inp label="Max Spread" path="maxSpread" step={0.5}/>
        <div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-400">Default</span><select value={cfg.defaultAlpha} onChange={e=>upd('defaultAlpha',e.target.value)} className="bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600">{Object.keys(cfg.alphas).map(k=><option key={k} value={k}>{cfg.alphas[k].label}</option>)}</select></div>
        <Inp label="MN mata-mata" path="mnMM" step={0.05}/>
      </div></div>
    <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50"><h3 className="text-sm font-bold text-emerald-300 mb-3">Perfis Alpha (α_atk / α_def / K)</h3>
      {Object.entries(cfg.alphas).map(([k,a])=>(<div key={k} className="flex items-center gap-3 mb-2"><span className="text-xs text-slate-300 w-24 font-medium">{a.label}</span><Inp label="α_atk" path={`alphas.${k}.atk`}/><Inp label="α_def" path={`alphas.${k}.def`}/><Inp label="K" path={`alphas.${k}.kElo`} step={1}/></div>))}</div>
    <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50"><h3 className="text-sm font-bold text-emerald-300 mb-3">Gols por jogo (total + peso casa)</h3>
      <p className="text-xs text-slate-500 mb-2">λ_casa = total × pesoCasa | λ_fora = total × (1 − pesoCasa)</p>
      {['A','B','C','D','CB'].map(s=>(<div key={s} className="flex items-center gap-3 mb-2"><span className="text-xs text-slate-300 w-16 font-medium">{s==='CB'?'Copa BR':`Série ${s}`}</span><Inp label="Total" path={`lambdas.${s}.total`} step={0.05}/><Inp label="Peso Casa" path={`lambdas.${s}.pesoCasa`} step={0.01}/><span className="text-[10px] text-slate-600">λ={(((cfg.lambdas[s]||{}).total||0)*((cfg.lambdas[s]||{}).pesoCasa||0)).toFixed(2)}+{(((cfg.lambdas[s]||{}).total||0)*(1-((cfg.lambdas[s]||{}).pesoCasa||0))).toFixed(2)}</span></div>))}</div>
    {cfg.c0Log&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
      <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-bold text-emerald-300">Favoritismo dependente do Elo (c0 logístico)</h3>
        <button onClick={()=>setCfg(p=>({...p,c0Log:{...p.c0Log,on:!p.c0Log.on}}))} className={`text-[11px] font-bold px-2 py-0.5 rounded ${cfg.c0Log.on?'bg-emerald-700 text-white':'bg-slate-700 text-slate-400'}`}>{cfg.c0Log.on?'ligado':'desligado'}</button></div>
      <p className="text-[11px] text-slate-500 mb-2">Aplica-se ao <span className="text-slate-400">modo Elo puro</span> (toggle "Elo puro" no Confronto e nas simulações com eo, incluindo a Copa). c0 = cMax − (cMax−cMin)/(1+e^(−(|Δ|−mid)/steep)); c0 menor = favoritismo mais forte. Desligado → c0 fixo 0,50 (comportamento anterior). Backtest de liga prefere c0 alto (menos favoritismo); o ganho fica nos grandes desníveis (Copa).</p>
      {cfg.c0Log.on&&<><div className="grid grid-cols-3 gap-3 mb-2"><Inp label="cMin (gap grande)" path="c0Log.cMin" step={0.05}/><Inp label="mid (Δ)" path="c0Log.mid" step={10}/><Inp label="steep" path="c0Log.steep" step={5}/></div>
      <div className="flex flex-wrap gap-2 text-[10px]">{[0,100,190,350,500].map(d=>{const L=cfg.c0Log;const c0=L.cMax-(L.cMax-L.cMin)/(1+Math.exp(-(Math.abs(d)-L.mid)/L.steep));return <span key={d} className="bg-slate-900/60 rounded px-2 py-0.5 font-mono text-slate-300">Δ{d}: c0={c0.toFixed(2)}</span>;})}</div></>}
    </div>}
    {dataHealth&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
      <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-bold text-emerald-300">Integridade dos Dados</h3><button onClick={()=>setShowMisses(!showMisses)} className="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 bg-slate-700 rounded">{showMisses?'Ocultar detalhes':'Ver não-casados'}</button></div>
      <p className="text-[11px] text-slate-500 mb-2">Quantos resultados reais casam com as fixtures. Para A/B/C o match é exato (casa/fora/rodada — fixtures oficiais CBF). Para D usa par+turno (agnóstico a mandante), corrigindo o bug da v4.2 onde 87% dos jogos eram silenciosamente ignorados.</p>
      <div>{['A','B','C','D'].map(s=>dataHealth[s]&&<SerieRow key={s} s={s} r={dataHealth[s]}/>)}</div>
      {showMisses&&<div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
        {['A','B','C','D'].map(s=>{const r=dataHealth[s];if(!r||!r.misses.length)return null;return(<div key={s} className="bg-slate-900/50 rounded p-2"><div className="text-[11px] font-bold text-amber-400 mb-1">Série {s} — {r.misses.length} jogo{r.misses.length>1?'s':''} sem match</div>{r.misses.slice(0,20).map((m,i)=>(<div key={i} className="text-[10px] text-slate-400 font-mono">R{m.r}: {m.c} {m.gc}×{m.gf} {m.f} <span className="text-slate-600 italic">({m.reason})</span></div>))}{r.misses.length>20&&<div className="text-[10px] text-slate-600 italic">... e mais {r.misses.length-20}</div>}</div>);})}
      </div>}
    </div>}
    {fixtureCheck&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
      <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-bold text-emerald-300">Validação Estrutural das Tabelas</h3>{(()=>{const all=['A','B','C','D'].reduce((a,s)=>a+(fixtureCheck[s]?.checks.filter(c=>!c.ok).length||0),0);return <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${all===0?'bg-green-900/50 text-green-300':'bg-amber-900/50 text-amber-300'}`}>{all===0?'tudo íntegro ✓':`${all} alerta${all>1?'s':''} ⚠`}</span>;})()}</div>
      <p className="text-[11px] text-slate-500 mb-3">Checagens de consistência do calendário (rodam no navegador, sem fonte externa): round-robin completo, mando balanceado, returno espelhando o turno, sem confronto duplicado e sem time jogando 2× na mesma rodada. Servem de rede de segurança ao ingerir resultados novos.</p>
      <div className="space-y-3">{['A','B','C','D'].map(s=>{const r=fixtureCheck[s];if(!r)return null;const serieOk=r.okCount===r.total;return(
        <div key={s} className="bg-slate-900/40 rounded-lg p-2.5">
          <div className="flex items-center gap-2 mb-1.5"><span className="text-xs font-bold text-slate-200">Série {s}</span><span className={`text-[10px] font-mono ${serieOk?'text-green-400':'text-amber-400'}`}>{r.okCount}/{r.total} checagens</span>{serieOk?<span className="text-green-400 text-xs">✓</span>:<span className="text-amber-400 text-xs">⚠</span>}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">{r.checks.map((c,i)=>(<div key={i} className="flex items-start gap-1.5 text-[10px]"><span className={c.ok?'text-green-400':'text-red-400'}>{c.ok?'✓':'✗'}</span><span className="text-slate-400 flex-1">{c.nome}{!c.ok&&<span className="text-red-400/80 italic"> — {c.det}</span>}</span></div>))}</div>
        </div>);})}</div>
    </div>}
    <div className="text-xs text-slate-500 text-center">Spread = log(targetRatio)/log(max/min) | Suavização: sign(s)·log(1+|s|) | λ = media × ATK × DEF</div>
    </>}
  </div>);
}

// ============================================================================
// CONFRONTO DIRETO (H2H) — feature #6
// Escolhe série + dois times; usa o estado atual de Elo/ATK/DEF (após os jogos já
// disputados) para prever o confronto via Poisson, e lista os encontros de 2026.
// ============================================================================
// Mapa de séries (times + Elo inicial + resultados) reutilizado por Confronto e Ao Vivo.
const H2H_SERIES={
  A:{nome:'Série A',times:Object.keys(SA_RANKING),getElo:t=>SA_RANKING[t].elo,res:SA_RES,sk:'A'},
  B:{nome:'Série B',times:Object.keys(SB_RANKING),getElo:t=>SB_RANKING[t].elo,res:SB_RES,sk:'B'},
  C:{nome:'Série C',times:Object.keys(SC_RANKING),getElo:t=>SC_RANKING[t].elo,res:SC_RES,sk:'C'},
  D:{nome:'Série D',times:[...SD_TIMES].sort((a,b)=>a.localeCompare(b)),getElo:t=>SD_INFO[t].elo,res:SD_RES,sk:'D'},
};
function H2HSim({cfg}){
  const SERIES=H2H_SERIES;
  const[serie,setSerie]=useState('A');
  const cur=SERIES[serie];
  const[mand,setMand]=useState(cur.times[0]);
  const[vis,setVis]=useState(cur.times[1]);
  const[eo,setEo]=useState(false);
  useEffect(()=>{const s=SERIES[serie];setMand(s.times[0]);setVis(s.times[1]);},[serie]);
  const ratings=useMemo(()=>computeCurrentAD(cur.times,cur.getElo,cur.res,cfg,cur.sk,cfg.defaultAlpha,false),[serie,cfg]);
  const ml=getML(cfg,cur.sk);
  const pred=useMemo(()=>{
    if(mand===vis||!ratings.elo[mand]||!ratings.elo[vis])return null;
    const{lC,lF}=calcL(ratings.atk[mand],ratings.def[mand],ratings.atk[vis],ratings.def[vis],ratings.elo[mand],ratings.elo[vis],ml.mc,ml.mf,cfg.homeAdv,eo,cfg.c0Log);
    const{pH,pD,pA}=calcProbs(lC,lF);
    const cells=[];let btts=0,over=0;
    for(let gc=0;gc<=6;gc++)for(let gf=0;gf<=6;gf++){const p=poissonProb(lC,gc)*poissonProb(lF,gf);cells.push({gc,gf,p});if(gc>0&&gf>0)btts+=p;if(gc+gf>=3)over+=p;}
    const tot=cells.reduce((s,c)=>s+c.p,0)||1;
    cells.forEach(c=>c.p=c.p/tot*100);
    cells.sort((a,b)=>b.p-a.p);
    return{lC,lF,pH,pD,pA,top:cells.slice(0,6),btts:btts/tot*100,over:over/tot*100};
  },[ratings,mand,vis,eo,ml.mc,ml.mf,cfg.homeAdv]);
  const hist=useMemo(()=>cur.res.filter(r=>(r.c===mand&&r.f===vis)||(r.c===vis&&r.f===mand)).sort((a,b)=>(a.r||0)-(b.r||0)),[cur.res,mand,vis]);
  const swap=()=>{setMand(vis);setVis(mand);};
  const Sel=({val,set})=>(<select value={val} onChange={e=>set(e.target.value)} className="flex-1 min-w-0 bg-slate-700 text-white text-xs sm:text-sm rounded-lg px-2 py-2 border border-slate-600">{cur.times.map(t=><option key={t} value={t}>{t}</option>)}</select>);
  const Bar=({pH,pD,pA})=>(<div className="flex h-7 rounded-lg overflow-hidden text-[10px] font-bold text-white">
    <div style={{width:`${pH}%`}} className="bg-emerald-600 flex items-center justify-center" title="vitória mandante">{pH>=8?`${pH.toFixed(0)}%`:''}</div>
    <div style={{width:`${pD}%`}} className="bg-slate-600 flex items-center justify-center" title="empate">{pD>=8?`${pD.toFixed(0)}%`:''}</div>
    <div style={{width:`${pA}%`}} className="bg-sky-700 flex items-center justify-center" title="vitória visitante">{pA>=8?`${pA.toFixed(0)}%`:''}</div>
  </div>);
  const RatRow=({lbl,a,b,fmt,better})=>{const fa=fmt?fmt(a):a,fb=fmt?fmt(b):b;const aBetter=better==='hi'?a>b:better==='lo'?a<b:false;const bBetter=better==='hi'?b>a:better==='lo'?b<a:false;return(<div className="flex items-center text-xs py-1 border-b border-slate-700/30 last:border-0"><span className={`w-1/3 text-right font-mono ${aBetter?'text-emerald-300 font-bold':'text-slate-300'}`}>{fa}</span><span className="w-1/3 text-center text-[10px] text-slate-500 uppercase tracking-wide">{lbl}</span><span className={`w-1/3 text-left font-mono ${bBetter?'text-sky-300 font-bold':'text-slate-300'}`}>{fb}</span></div>);};
  return(<div className="space-y-4">
    <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50 space-y-3">
      <div className="flex items-center gap-2"><span className="text-xs text-slate-400">Série</span>
        <div className="flex gap-1">{['A','B','C','D'].map(s=>(<button key={s} onClick={()=>setSerie(s)} className={`px-3 py-1 rounded-lg text-xs font-medium ${serie===s?'bg-emerald-600 text-white':'bg-slate-700 text-slate-400 hover:text-white'}`}>{s}</button>))}</div>
        <label className="flex items-center gap-1 ml-auto text-[11px] text-slate-400 cursor-pointer"><input type="checkbox" checked={eo} onChange={e=>setEo(e.target.checked)} className="accent-emerald-500"/>Elo puro</label>
      </div>
      <div className="flex items-center gap-1.5">
        <Sel val={mand} set={setMand}/>
        <button onClick={swap} title="inverter mando" className="px-2 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300 text-sm shrink-0">⇄</button>
        <Sel val={vis} set={setVis}/>
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 px-1"><span>🏠 mandante</span><span>visitante ✈️</span></div>
    </div>
    {mand===vis?<div className="text-center text-amber-400 text-sm py-6">Escolha dois times diferentes.</div>:pred&&<>
      <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-3 text-sm font-bold"><span className="flex items-center gap-1 text-emerald-300"><Badge name={mand} size={22}/>{mand}</span><span className="text-slate-500 text-xs">vs</span><span className="flex items-center gap-1 text-sky-300">{vis}<Badge name={vis} size={22}/></span></div>
        <Bar pH={pred.pH} pD={pred.pD} pA={pred.pA}/>
        <div className="flex justify-between mt-2 text-center"><div className="flex-1"><div className="text-lg font-bold text-emerald-300">{pred.pH.toFixed(1)}%</div><div className="text-[10px] text-slate-500">vitória</div></div><div className="flex-1"><div className="text-lg font-bold text-slate-300">{pred.pD.toFixed(1)}%</div><div className="text-[10px] text-slate-500">empate</div></div><div className="flex-1"><div className="text-lg font-bold text-sky-300">{pred.pA.toFixed(1)}%</div><div className="text-[10px] text-slate-500">vitória</div></div></div>
        <div className="grid grid-cols-3 gap-2 mt-4 text-center text-xs">
          <div className="bg-slate-900/50 rounded-lg p-2"><div className="text-slate-500 text-[10px]">gols esperados</div><div className="font-mono text-white">{pred.lC.toFixed(2)} – {pred.lF.toFixed(2)}</div></div>
          <div className="bg-slate-900/50 rounded-lg p-2"><div className="text-slate-500 text-[10px]">ambos marcam</div><div className="font-mono text-white">{pred.btts.toFixed(0)}%</div></div>
          <div className="bg-slate-900/50 rounded-lg p-2"><div className="text-slate-500 text-[10px]">+2.5 gols</div><div className="font-mono text-white">{pred.over.toFixed(0)}%</div></div>
        </div>
        <div className="mt-4"><div className="text-[11px] text-slate-400 mb-1.5">Placares mais prováveis</div>
          <div className="flex flex-wrap gap-1.5">{pred.top.map((c,i)=>(<div key={i} className={`px-2.5 py-1 rounded-lg text-xs font-mono ${i===0?'bg-emerald-900/60 text-emerald-200 border border-emerald-700/50':'bg-slate-900/50 text-slate-300'}`}>{c.gc}–{c.gf} <span className="text-slate-500">{c.p.toFixed(1)}%</span></div>))}</div></div>
        {eo&&<div className="text-[10px] text-slate-500 italic mt-3">Modo "Elo puro": λ derivado só da diferença de Elo (ignora ATK/DEF aprendidos).</div>}
      </div>
      <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
        <div className="text-[11px] text-slate-400 mb-2 text-center">Ratings atuais (após os jogos disputados)</div>
        <div className="flex items-center justify-between text-xs font-bold mb-1"><span className="w-1/3 text-right text-emerald-300">{mand}</span><span className="w-1/3"></span><span className="w-1/3 text-left text-sky-300">{vis}</span></div>
        <RatRow lbl="Elo" a={Math.round(ratings.elo[mand])} b={Math.round(ratings.elo[vis])} better="hi"/>
        <RatRow lbl="ATK" a={ratings.atk[mand]} b={ratings.atk[vis]} fmt={v=>v.toFixed(2)} better="hi"/>
        <RatRow lbl="DEF" a={ratings.def[mand]} b={ratings.def[vis]} fmt={v=>v.toFixed(2)} better="lo"/>
        <div className="text-[10px] text-slate-600 text-center mt-2">ATK maior = ataque mais forte · DEF menor = defesa mais sólida</div>
      </div>
      <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
        <div className="text-[11px] text-slate-400 mb-2">Confrontos em 2026 {hist.length>0&&`(${hist.length})`}</div>
        {hist.length===0?<div className="text-xs text-slate-500 italic">Ainda não se enfrentaram nesta temporada.</div>:
          <div className="space-y-1">{hist.map((r,i)=>{const win=r.gc>r.gf?r.c:r.gf>r.gc?r.f:null;return(<div key={i} className="flex items-center gap-2 text-xs bg-slate-900/40 rounded-lg px-3 py-1.5"><span className="text-slate-500 w-8">R{r.r}</span><span className={`flex-1 text-right ${win===r.c?'text-white font-bold':'text-slate-400'}`}>{r.c}</span><span className="font-mono font-bold text-white px-2">{r.gc}–{r.gf}</span><span className={`flex-1 ${win===r.f?'text-white font-bold':'text-slate-400'}`}>{r.f}</span></div>);})}</div>}
      </div>
    </>}
  </div>);
}

// ============================================================================
// CALIBRAÇÃO / BACKTEST (#5)
// Walk-forward out-of-sample sobre os jogos já disputados das 4 séries. Mede se as
// probabilidades V/E/D do modelo são confiáveis (Brier, log loss, reliability).
// ============================================================================
function CalibSim({cfg}){
  const bt=useMemo(()=>runBacktest(cfg),[cfg]);
  const g=bt.global;
  const skillBr=g.brierUnif>0?(1-g.brier/g.brierUnif)*100:0;
  const skillLL=g.loglossUnif>0?(1-g.logloss/g.loglossUnif)*100:0;
  // reliability SVG
  const x0=42,plotW=224,yBase=232,plotH=200;
  const px=v=>x0+v/100*plotW, py=v=>yBase-v/100*plotH;
  const pts=bt.bins.filter(b=>b.n>0).map(b=>({pm:b.sumP/b.n*100,of:b.sumO/b.n*100,n:b.n}));
  const maxN=Math.max(1,...pts.map(p=>p.n));
  const Card=({lbl,val,sub,good})=>(<div className="bg-slate-900/50 rounded-xl p-3 text-center"><div className="text-[10px] text-slate-500 uppercase tracking-wide">{lbl}</div><div className={`text-xl font-bold ${good===true?'text-emerald-300':good===false?'text-amber-300':'text-white'}`}>{val}</div>{sub&&<div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}</div>);
  return(<div className="space-y-4">
    <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
      <h3 className="text-sm font-bold text-emerald-300 mb-1">Calibração do modelo (backtest walk-forward)</h3>
      <p className="text-[11px] text-slate-500 mb-3">Para cada um dos {g.n} jogos já disputados (A+B+C+D), o modelo previu o resultado usando <span className="text-slate-400">apenas os jogos anteriores</span> (out-of-sample) e comparamos com o que aconteceu. Brier e log loss menores = melhor. O baseline honesto é o palpite uniforme 33/33/33 (sem informação).</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card lbl="Brier (modelo)" val={g.brier.toFixed(3)} sub={`uniforme ${g.brierUnif.toFixed(3)}`} good={g.brier<g.brierUnif}/>
        <Card lbl="Ganho vs uniforme" val={`${skillBr>=0?'+':''}${skillBr.toFixed(1)}%`} sub="Brier skill" good={skillBr>0}/>
        <Card lbl="Log loss" val={g.logloss.toFixed(3)} sub={`uniforme ${g.loglossUnif.toFixed(3)}`} good={g.logloss<g.loglossUnif}/>
        <Card lbl="Acerto do favorito" val={`${(g.acc*100).toFixed(0)}%`} sub={`mandante venceu ${(g.homeRate*100).toFixed(0)}%`}/>
      </div>
    </div>
    <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
      <div className="text-[11px] text-slate-400 mb-2">Diagrama de confiabilidade — probabilidade prevista × frequência observada (cada ponto agrupa previsões V/E/D numa faixa de 10%; tamanho ∝ nº de previsões)</div>
      <svg viewBox="0 0 280 252" className="w-full max-w-md mx-auto">
        <line x1={px(0)} y1={py(0)} x2={px(0)} y2={py(100)} stroke="#475569" strokeWidth="1"/>
        <line x1={px(0)} y1={py(0)} x2={px(100)} y2={py(0)} stroke="#475569" strokeWidth="1"/>
        <line x1={px(0)} y1={py(0)} x2={px(100)} y2={py(100)} stroke="#64748b" strokeWidth="1" strokeDasharray="4 3"/>
        {[0,50,100].map(v=>(<g key={'x'+v}><line x1={px(v)} y1={py(0)} x2={px(v)} y2={py(0)+4} stroke="#475569"/><text x={px(v)} y={py(0)+15} fill="#64748b" fontSize="9" textAnchor="middle">{v}%</text></g>))}
        {[0,50,100].map(v=>(<g key={'y'+v}><line x1={px(0)-4} y1={py(v)} x2={px(0)} y2={py(v)} stroke="#475569"/><text x={px(0)-7} y={py(v)+3} fill="#64748b" fontSize="9" textAnchor="end">{v}%</text></g>))}
        <text x={px(50)} y={py(0)+28} fill="#94a3b8" fontSize="9" textAnchor="middle">probabilidade prevista</text>
        <text x={12} y={py(50)} fill="#94a3b8" fontSize="9" textAnchor="middle" transform={`rotate(-90 12 ${py(50)})`}>frequência real</text>
        <polyline points={pts.map(p=>`${px(p.pm)},${py(p.of)}`).join(' ')} fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.5"/>
        {pts.map((p,i)=>(<circle key={i} cx={px(p.pm)} cy={py(p.of)} r={3+6*Math.sqrt(p.n/maxN)} fill="#10b981" opacity="0.8"/>))}
      </svg>
      <p className="text-[10px] text-slate-500 text-center">Pontos sobre a diagonal = bem calibrado. Acima dela = modelo subestimou; abaixo = superestimou (excesso de confiança).</p>
    </div>
    <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
      <div className="text-[11px] text-slate-400 mb-2">Por série</div>
      <div className="grid grid-cols-5 gap-1 text-[10px] text-slate-500 font-medium border-b border-slate-700/40 pb-1 mb-1"><span>Série</span><span className="text-right">Brier</span><span className="text-right">Log loss</span><span className="text-right">Favorito</span><span className="text-right">n</span></div>
      {['A','B','C','D'].map(s=>{const m=bt.per[s];if(!m)return null;return(<div key={s} className="grid grid-cols-5 gap-1 text-[11px] py-0.5"><span className="text-slate-300 font-bold">{s}</span><span className={`text-right font-mono ${m.brier<m.brierUnif?'text-emerald-300':'text-amber-300'}`}>{m.brier.toFixed(3)}</span><span className="text-right font-mono text-slate-300">{m.logloss.toFixed(3)}</span><span className="text-right font-mono text-slate-300">{(m.acc*100).toFixed(0)}%</span><span className="text-right font-mono text-slate-500">{m.n}</span></div>);})}
    </div>
    <div className="bg-slate-800/40 rounded-2xl p-3 border border-slate-700/50 text-[10px] text-slate-500 leading-relaxed">
      <span className="text-slate-400 font-medium">Como ler:</span> futebol é intrinsecamente ruidoso — modelos 1X2 de referência ficam na casa de Brier ~0,62–0,64, então valores próximos disso são normais. O ganho sobre o palpite uniforme mede o sinal real capturado. Mexer nos parâmetros do Config (perfil α, vantagem de casa, λ de gols) recalcula tudo aqui na hora — dá para usar esta aba para <span className="text-slate-400">calibrar o modelo</span> buscando o menor Brier/log loss.
    </div>
  </div>);
}

// ============================================================================
// SIMULADOR DE LIGA (A/B/C) — 5 sub-abas
// ============================================================================
function LeagueSim({times,ranking,tabela,res,meta,cfg,extraRes,initialMC,initialAk,initialEo,initialDrift}){
  const[aba,setAba]=useState('ratings');const[nS,setNS]=useState(1000);const[ak,setAk]=useState(initialAk||cfg.defaultAlpha);const[eo,setEo]=useState(initialEo||false);
  const[rMC,setRMC]=useState(initialMC||null);const[rSU,setRSU]=useState(null);const[busy,setBusy]=useState(false);const[rF,setRF]=useState(0);
  const[userRes,setUserRes]=useState([]);
  // Drift efetivo: usa valor do dashboard (ou 0 se não definido)
  const effCfg=useMemo(()=>({...cfg,drift:initialDrift!==undefined?initialDrift:cfg.drift||0}),[cfg,initialDrift]);
  // Sincroniza com resultado do dashboard ("Simular Tudo"). Se dash roda, aba
  // atualiza rMC + configs alinhadas sem precisar clicar Monte Carlo de novo.
  useEffect(()=>{if(initialMC){setRMC(initialMC);if(initialAk)setAk(initialAk);if(initialEo!==undefined)setEo(initialEo);}},[initialMC,initialAk,initialEo]);
  const allRes=useMemo(()=>[...res,...(extraRes||[]),...userRes],[res,extraRes,userRes]);
  const setScore=(casa,fora,rodada,gc,gf)=>{setUserRes(prev=>{const without=prev.filter(r=>!(r.c===casa&&r.f===fora&&r.r===rodada));if(gc===null)return without;return[...without,{c:casa,f:fora,gc,gf,r:rodada}];});setRMC(null);setRSU(null);};
  const lg=useMemo(()=>initLeague(times,t=>ranking[t].elo,cfg),[times,ranking,cfg]);
  const cl=useMemo(()=>calcClassif(times,allRes),[times,allRes]);const maxR=Math.max(0,...allRes.map(r=>r.r));
  const ranks=useMemo(()=>{
    const cur=computeCurrentAD(times,t=>ranking[t].elo,allRes,cfg,meta.key,ak,true);
    return times.map(t=>({time:t,eloIni:ranking[t].elo,elo:Math.round(cur.elo[t]),dE:Math.round(cur.elo[t]-ranking[t].elo),atkIni:cur.atkIni[t],atk:cur.atk[t],dA:cur.atk[t]-cur.atkIni[t],defIni:cur.defIni[t],def:cur.def[t],dD:cur.def[t]-cur.defIni[t],ad:cur.atk[t]/cur.def[t]})).sort((a,b)=>b.elo-a.elo);
  },[times,ranking,allRes,cfg,ak,meta.key]);
  const ranksSort=useSortable(ranks,'elo','desc');
  // Enriquece probs do MC com eloAtual (do ranks via lookup), para a tabela MC
  // mostrar o ELO já evoluído pelos resultados reais (em vez do ELO fim pós-simulação).
  const probsEnriched=useMemo(()=>{
    if(!rMC)return [];
    const m=Object.fromEntries(ranks.map(r=>[r.time,r.elo]));
    return rMC.probs.map(p=>({...p,eloAtual:m[p.time]||0}));
  },[rMC,ranks]);
  const mcSort=useSortable(probsEnriched,'mediaPts','desc');
  const form=useMemo(()=>extractForm(times,allRes),[times,allRes]);
  const[qR,setQR]=useState('');const[qM,setQM]=useState('');
  const ranksFiltered=useMemo(()=>filterByName(ranksSort.sorted,qR),[ranksSort.sorted,qR]);
  const mcFiltered=useMemo(()=>filterByName(mcSort.sorted,qM),[mcSort.sorted,qM]);
  const[progress,setProgress]=useState(0);
  const doMC=useCallback(()=>{setBusy(true);setProgress(0);
    simMC_async(times,ranking,tabela,allRes,cfg,meta.key,nS,ak,eo,
      (done,total)=>setProgress(done/total),
      (result)=>{setRMC(result);setBusy(false);setProgress(1);});
  },[times,ranking,tabela,allRes,cfg,meta.key,nS,ak,eo]);
  const doSU=useCallback(()=>{setRSU(simUnica(times,ranking,tabela,allRes,effCfg,meta.key,ak,eo));setAba('simU');},[times,ranking,tabela,allRes,effCfg,meta.key,ak,eo]);
  const getCor=(pos)=>{const z=meta.zonas;if(z.g4&&pos<=z.g4)return'bg-blue-900/40 border-l-2 border-blue-400';if(z.g6&&pos<=z.g6)return'bg-sky-900/30 border-l-2 border-sky-500';if(z.g8&&pos<=z.g8)return'bg-teal-900/20 border-l-2 border-teal-600';if(z.z4&&pos>=z.z4)return'bg-red-900/30 border-l-2 border-red-500';return'bg-slate-800/30 border-l-2 border-slate-600';};
  const jVis=useMemo(()=>{if(rF>0)return tabela.filter(j=>j.rodada===rF);for(let r=1;r<=meta.nR;r++){const jr=tabela.filter(j=>j.rodada===r);if(!jr.every(j=>allRes.some(x=>x.c===j.casa&&x.f===j.fora&&x.r===j.rodada)))return jr;}return tabela.slice(0,10);},[tabela,allRes,rF,meta.nR]);
  const CT=({data})=>(<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-slate-400 border-b border-slate-700 text-xs"><th className="text-left py-2 w-8">#</th><th className="text-left py-2">Time</th><th className="text-center py-2">P</th><th className="text-center py-2">J</th><th className="text-center py-2">V</th><th className="text-center py-2">E</th><th className="text-center py-2">D</th><th className="text-center py-2">GP</th><th className="text-center py-2">GC</th><th className="text-center py-2">SG</th></tr></thead><tbody>{data.map(c=>(<tr key={c.time} className={`${getCor(c.pos)} rounded hover:brightness-125`}><td className="py-1 pl-2 font-bold text-slate-500">{c.pos}</td><td className="py-1 font-medium"><TN name={c.time}/></td><td className="text-center font-bold text-emerald-300">{c.P}</td><td className="text-center text-slate-400">{c.J}</td><td className="text-center text-green-400">{c.V}</td><td className="text-center text-yellow-400">{c.E}</td><td className="text-center text-red-400">{c.D}</td><td className="text-center">{c.GP}</td><td className="text-center">{c.GC}</td><td className={`text-center font-medium ${c.SG>0?'text-green-400':c.SG<0?'text-red-400':'text-slate-400'}`}>{c.SG>0?'+':''}{c.SG}</td></tr>))}</tbody></table></div>);
  return(<div>
    <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
      <span className="text-[10px] text-slate-500 italic mr-2">Para Monte Carlo, use "Simular Tudo" no dashboard acima.</span>
      <button onClick={doSU} className="px-4 py-1.5 bg-slate-700 rounded-lg text-xs border border-slate-600 hover:bg-slate-600 transition-colors">1 Sim rápido</button>
    </div>
    <div className="flex gap-1 mb-3 bg-slate-800/40 rounded-xl p-1">{[{id:'ratings',l:'Ratings'},{id:'jogos',l:'Jogos'},{id:'classif',l:'Classificação'},{id:'mc',l:'Monte Carlo'},...((meta.key==='B'||meta.key==='C')?[{id:'chaves',l:'Chaves'}]:[]),{id:'simU',l:'1 Simulação'}].map(t=>(<button key={t.id} onClick={()=>setAba(t.id)} className={`flex-1 py-1.5 px-1 rounded-lg text-xs font-medium ${aba===t.id?'bg-emerald-600/80 text-white shadow':'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>{t.l}</button>))}</div>
    {aba==='ratings'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50"><h2 className="text-base font-semibold text-emerald-300 mb-1">ELO + ATK/DEF{eo&&' (ELO puro)'}</h2><p className="text-xs text-slate-500 mb-3">Spread={lg.spread.toFixed(2)} | {(()=>{const{mc,mf}=getML(cfg,meta.key);return`λ=${mc.toFixed(2)}+${mf.toFixed(2)}`;})()} · Inclui jogos da Copa do Brasil · <span className="italic">Clique nos cabeçalhos para ordenar</span></p>
      <TableToolbar query={qR} setQuery={setQR} showing={ranksFiltered.length} total={ranksSort.sorted.length}
        onExport={()=>exportCSV(ranksFiltered,[{label:'Time',key:'time'},{label:'ELO ini',key:'eloIni'},{label:'ELO atual',key:'elo'},{label:'ΔELO',key:'dE'},{label:'ATK ini',key:'atkIni'},{label:'ATK',key:'atk'},{label:'ΔATK',key:'dA'},{label:'DEF ini',key:'defIni'},{label:'DEF',key:'def'},{label:'ΔDEF',key:'dD'}],`ratings_${meta.key}.csv`)}/>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-700 text-xs">
        <th className="text-left py-2 w-8 text-slate-500">#</th>
        <SortHeader k="time" label="Time" sort={ranksSort.sort} onClick={ranksSort.toggle} className="py-2"/>
        <SortHeader k="eloIni" label="ELO ini" sort={ranksSort.sort} onClick={ranksSort.toggle} align="right" className="py-2"/>
        <SortHeader k="elo" label="ELO" sort={ranksSort.sort} onClick={ranksSort.toggle} align="right" className="py-2"/>
        <SortHeader k="dE" label="ΔELO" sort={ranksSort.sort} onClick={ranksSort.toggle} align="right" className="py-2"/>
        <th className="text-center py-2 text-slate-400" title="Últimos 5 resultados (mais antigo → mais recente)">Forma</th>
        <SortHeader k="atkIni" label="ATK ini" sort={ranksSort.sort} onClick={ranksSort.toggle} align="right" className="py-2"/>
        <SortHeader k="atk" label="ATK" sort={ranksSort.sort} onClick={ranksSort.toggle} align="right" className="py-2"/>
        <SortHeader k="dA" label="ΔATK" sort={ranksSort.sort} onClick={ranksSort.toggle} align="right" className="py-2"/>
        <SortHeader k="defIni" label="DEF ini" sort={ranksSort.sort} onClick={ranksSort.toggle} align="right" className="py-2"/>
        <SortHeader k="def" label="DEF" sort={ranksSort.sort} onClick={ranksSort.toggle} align="right" className="py-2"/>
        <SortHeader k="dD" label="ΔDEF" sort={ranksSort.sort} onClick={ranksSort.toggle} align="right" className="py-2"/>
      </tr></thead><tbody>{ranksFiltered.map((r,i)=>(<tr key={r.time} className="border-b border-slate-700/20 hover:bg-slate-700/30 transition-colors"><td className="py-1 pl-2 text-slate-500 font-bold">{i+1}</td><td className="py-1 font-medium"><TN name={r.time}/></td><td className="text-right font-mono text-slate-500 text-xs">{r.eloIni}</td><td className="text-right font-mono font-bold">{r.elo}</td><td className={`text-right font-mono text-xs ${r.dE>0?'text-green-400':r.dE<0?'text-red-400':'text-slate-500'}`}>{r.dE>0?'+':''}{r.dE}</td><td className="text-center"><FormStreak results={form[r.time]}/></td><td className="text-right font-mono text-slate-500 text-xs">{r.atkIni.toFixed(2)}</td><td className={`text-right font-mono ${r.atk>1.05?'text-green-400':r.atk<0.95?'text-red-400':'text-slate-300'}`}>{r.atk.toFixed(2)}</td><td className={`text-right font-mono text-xs ${r.dA>0.01?'text-green-400':r.dA<-0.01?'text-red-400':'text-slate-500'}`}>{r.dA>0?'+':''}{r.dA.toFixed(2)}</td><td className="text-right font-mono text-slate-500 text-xs">{r.defIni.toFixed(2)}</td><td className={`text-right font-mono ${r.def<0.95?'text-green-400':r.def>1.05?'text-red-400':'text-slate-300'}`}>{r.def.toFixed(2)}</td><td className={`text-right font-mono text-xs ${r.dD<-0.01?'text-green-400':r.dD>0.01?'text-red-400':'text-slate-500'}`}>{r.dD>0?'+':''}{r.dD.toFixed(2)}</td></tr>))}</tbody></table></div></div>}
    {aba==='jogos'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50"><div className="flex items-center justify-between mb-3"><h2 className="text-base font-semibold text-emerald-300">Jogos</h2><select value={rF} onChange={e=>setRF(Number(e.target.value))} className="bg-slate-700 text-white text-xs rounded-lg px-2 py-1 border border-slate-600"><option value={0}>Próxima</option>{Array.from({length:meta.nR},(_,i)=>i+1).map(r=>{const dt=(tabela.find(j=>j.rodada===r)||{}).data||'';return (<option key={r} value={r}>{'R'+r+(dt?' ('+dt+')':'')}</option>);})}</select></div>
      <div className="space-y-0.5 max-h-[500px] overflow-y-auto">{jVis.map((j,i)=>{const builtIn=res.find(r=>r.c===j.casa&&r.f===j.fora&&r.r===j.rodada);const user=userRes.find(r=>r.c===j.casa&&r.f===j.fora&&(r.r===j.rodada||r.r===0));const fetched=(extraRes||[]).find(r=>r.c===j.casa&&r.f===j.fora&&(r.r===j.rodada||r.r===0));const rl=builtIn||user||fetched;const isFetched=!!fetched&&!builtIn&&!user;let prob=null;if(!rl){const rc=ranks.find(x=>x.time===j.casa),rf=ranks.find(x=>x.time===j.fora);if(rc&&rf){const{mc:m1,mf:m2}=getML(cfg,meta.key);const{lC,lF}=calcL(rc.atk,rc.def,rf.atk,rf.def,rc.elo,rf.elo,m1,m2,cfg.homeAdv,eo,cfg.c0Log);prob=calcProbs(lC,lF);}}return <GameRow key={i} j={j} real={rl} prob={prob} isUser={!!(user||isFetched)&&!builtIn} onScore={builtIn?null:setScore}/>;})}</div>
      {userRes.length>0&&<div className="mt-2 flex items-center justify-between"><span className="text-xs text-amber-400">{userRes.length} resultado(s) inserido(s) manualmente</span><button onClick={()=>{setUserRes([]);setRMC(null);setRSU(null);}} className="text-xs text-red-400 hover:text-red-300">Limpar todos</button></div>}</div>}
    {aba==='classif'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50"><h2 className="text-base font-semibold text-emerald-300 mb-3">{maxR>0?`Após R${maxR}`:'Pré-temporada'} — {allRes.length} jogos{userRes.length>0?` (${userRes.length} manuais)`:''}</h2><CT data={cl}/><ZonasLegend meta={meta}/></div>}
    {aba==='mc'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">{!rMC?<p className="text-slate-400 text-center py-8">Rode "⚡ Simular Tudo" no dashboard acima para ver os resultados Monte Carlo.</p>:<div><h2 className="text-base font-semibold text-emerald-300 mb-3">{rMC.nSims.toLocaleString()} sims{eo&&' (ELO)'}</h2>
      {rMC.cortes&&<div className="mb-4 overflow-x-auto"><table className="text-xs w-full max-w-md"><thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left py-1">Posição</th><th className="text-center py-1">p10</th><th className="text-center py-1 font-bold">p50</th><th className="text-center py-1">p90</th></tr></thead><tbody>
        {[{l:'Título (1°)',d:rMC.cortes.titulo,c:'text-yellow-300'},{l:'G'+(meta.zonas.g4||4)+' ('+((meta.zonas.g4||4))+'°)',d:rMC.cortes.g4,c:'text-blue-300'},{l:'Meio ('+(Math.floor(times.length/2)+1)+'°)',d:rMC.cortes.meio,c:'text-slate-300'},{l:'Z'+(meta.nReb||4)+' ('+(times.length-(meta.nReb||4)+1)+'°)',d:rMC.cortes.z4,c:'text-red-300'},{l:'Último ('+times.length+'°)',d:rMC.cortes.ultimo,c:'text-red-400'}].map(r=>(<tr key={r.l} className="border-b border-slate-700/30"><td className={`py-1 font-medium ${r.c}`}>{r.l}</td><td className="text-center font-mono">{r.d.p10}</td><td className="text-center font-mono font-bold">{r.d.p50}</td><td className="text-center font-mono">{r.d.p90}</td></tr>))}
      </tbody></table></div>}
      <TableToolbar query={qM} setQuery={setQM} showing={mcFiltered.length} total={mcSort.sorted.length}
        onExport={()=>{
          const cols=[{label:'Time',key:'time'},{label:'MediaPts',key:'mediaPts'},{label:'ELO atual',key:'eloAtual'},{label:'Titulo%',key:'titulo'}];
          if(meta.key==='B')cols.push({label:'G2%',key:'g4'},{label:'Playoff%',key:'bPlayoff'},{label:'Acesso%',key:'bAccess'});
          else if(meta.key==='C')cols.push({label:'G8%',key:'g4'},{label:'Acesso%',key:'q4'},{label:'CampC%',key:'qChamp'});
          else cols.push({label:`G${meta.zonas.g4||4}%`,key:'g4'});
          cols.push({label:'Z4%',key:'z4'});
          exportCSV(mcFiltered,cols,`mc_${meta.key}.csv`);
        }}/>
      <div className="overflow-x-auto mb-4"><table className="w-full text-sm"><thead><tr className="border-b border-slate-700 text-xs">
        <th className="text-left py-2 w-8 text-slate-500">#</th>
        <SortHeader k="time" label="Time" sort={mcSort.sort} onClick={mcSort.toggle} className="py-2"/>
        <SortHeader k="mediaPts" label="Pts (méd)" sort={mcSort.sort} onClick={mcSort.toggle} align="center" className="py-2"/>
        <SortHeader k="medianPts" label="p10 / p50 / p90" sort={mcSort.sort} onClick={mcSort.toggle} align="center" className="py-2"/>
        <SortHeader k="eloAtual" label="ELO atual" sort={mcSort.sort} onClick={mcSort.toggle} align="right" className="py-2"/>
        <SortHeader k="titulo" label="Título%" sort={mcSort.sort} onClick={mcSort.toggle} align="center" className="py-2"/>
        {meta.key==='B'&&<SortHeader k="g4" label="G2%" sort={mcSort.sort} onClick={mcSort.toggle} align="center" className="py-2"/>}
        {meta.key==='B'&&<SortHeader k="bPlayoff" label="PO%" sort={mcSort.sort} onClick={mcSort.toggle} align="center" className="py-2"/>}
        {meta.key==='B'&&<SortHeader k="bAccess" label="Acesso%" sort={mcSort.sort} onClick={mcSort.toggle} align="center" className="py-2"/>}
        {meta.key==='C'&&<SortHeader k="g4" label="G8%" sort={mcSort.sort} onClick={mcSort.toggle} align="center" className="py-2"/>}
        {meta.key==='C'&&<SortHeader k="q4" label="Acesso%" sort={mcSort.sort} onClick={mcSort.toggle} align="center" className="py-2"/>}
        {meta.key==='C'&&<SortHeader k="qChamp" label="Camp%" sort={mcSort.sort} onClick={mcSort.toggle} align="center" className="py-2"/>}
        {meta.key!=='B'&&meta.key!=='C'&&<SortHeader k="g4" label={`G${meta.zonas.g4||4}%`} sort={mcSort.sort} onClick={mcSort.toggle} align="center" className="py-2"/>}
        <SortHeader k="z4" label="Z4%" sort={mcSort.sort} onClick={mcSort.toggle} align="center" className="py-2"/>
      </tr></thead><tbody>{mcFiltered.map((p,i)=>{
        const fmt=(v)=>v==null?'—':(v<0.5&&v>0?'<1':Math.round(v));
        return(<tr key={p.time} className="border-b border-slate-700/30 hover:bg-slate-700/30 transition-colors">
          <td className="py-1 pl-2 text-slate-500 font-bold">{i+1}</td>
          <td className="py-1 font-medium text-xs"><TN name={p.time}/></td>
          <td className="text-center font-mono text-emerald-300">{(p.mediaPts||0).toFixed(1)}</td>
          <td className="text-center font-mono text-xs"><span className="text-slate-500">{p.p10Pts||0}</span><span className="text-slate-600">/</span><span className="text-emerald-200 font-bold">{p.medianPts||0}</span><span className="text-slate-600">/</span><span className="text-slate-500">{p.p90Pts||0}</span></td>
          <td className="text-right font-mono text-emerald-300 text-xs">{p.eloAtual||'—'}</td>
          <td className="text-center font-mono text-yellow-400">{fmt(p.titulo)}</td>
          {meta.key==='B'&&<td className="text-center font-mono text-slate-400">{fmt(p.g4)}</td>}
          {meta.key==='B'&&<td className="text-center font-mono text-slate-400">{fmt(p.bPlayoff)}</td>}
          {meta.key==='B'&&<td className="text-center font-mono text-blue-400 font-bold">{fmt(p.bAccess)}</td>}
          {meta.key==='C'&&<td className="text-center font-mono text-slate-400">{fmt(p.g4)}</td>}
          {meta.key==='C'&&<td className="text-center font-mono text-blue-400 font-bold">{fmt(p.q4)}</td>}
          {meta.key==='C'&&<td className="text-center font-mono text-yellow-400">{fmt(p.qChamp)}</td>}
          {meta.key!=='B'&&meta.key!=='C'&&<td className="text-center font-mono text-blue-400">{fmt(p.g4)}</td>}
          <td className="text-center font-mono text-red-400">{fmt(p.z4)}</td>
        </tr>);
      })}</tbody></table></div>
      <div className="text-[10px] text-slate-500 italic">Pts (méd) = média · p10/p50/p90 = pessimista / mediana / otimista (10/50/90% das simulações ficaram com pelo menos esse valor).{meta.key==='B'&&' G2 = acesso direto (top-2). PO = participou do playoff (3º-6º). Acesso = acesso efetivo à Série A (G2 + vencedores do playoff, 4 vagas totais).'}{meta.key==='C'&&' G8 = fase intermediária (8 classificados do ponto corrido). Acesso = top-2 de cada grupo do quadrangular final. CampC = venceu a final da Série C.'}</div>
      <ZonasLegend meta={meta}/>
      <details className="mt-2"><summary className="text-xs text-emerald-400 cursor-pointer hover:underline">Evolução atk / def / Elo — inicial → final</summary>
      <p className="text-[10px] text-slate-500 mt-1 mb-2 italic">atk = força ofensiva (maior = melhor). def = coef. de gols sofridos (<span className="text-slate-300">menor = melhor defesa</span>). ΔElo positivo = time subiu; Δatk positivo = ataque melhorou; Δdef positivo = defesa piorou.</p>
      <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr className="text-slate-400 border-b border-slate-700">
        <th className="text-left py-1 px-1">Time</th>
        <th className="text-center py-1 px-1" colSpan="3">ELO</th>
        <th className="text-center py-1 px-1 border-l border-slate-700/50" colSpan="3">ATK</th>
        <th className="text-center py-1 px-1 border-l border-slate-700/50" colSpan="3">DEF</th>
      </tr><tr className="text-slate-500 border-b border-slate-700/50 text-[10px]">
        <th></th>
        <th className="text-center">ini</th><th className="text-center">fim</th><th className="text-center">Δ</th>
        <th className="text-center border-l border-slate-700/50">ini</th><th className="text-center">fim</th><th className="text-center">Δ</th>
        <th className="text-center border-l border-slate-700/50">ini</th><th className="text-center">fim</th><th className="text-center">Δ</th>
      </tr></thead><tbody>{mcFiltered.map(p=>{
        const eI=ranking[p.time]?.elo||0,eF=p.eloFinal||eI,dE=eF-eI;
        const aI=p.atk||0,aF=p.atkFinal!=null?p.atkFinal:aI,dA=aF-aI;
        const dI=p.def||0,dF=p.defFinal!=null?p.defFinal:dI,dD=dF-dI;
        const sgn=(v,fmt=2)=>(v>=0?'+':'')+v.toFixed(fmt);
        return(<tr key={p.time} className="border-b border-slate-700/20 hover:bg-slate-700/20">
          <td className="py-0.5 px-1 font-medium"><TN name={p.time}/></td>
          <td className="text-center font-mono">{eI}</td>
          <td className="text-center font-mono">{eF}</td>
          <td className={`text-center font-mono ${dE>5?'text-emerald-400':dE<-5?'text-red-400':'text-slate-400'}`}>{sgn(dE,0)}</td>
          <td className="text-center font-mono border-l border-slate-700/50">{aI.toFixed(2)}</td>
          <td className="text-center font-mono">{aF.toFixed(2)}</td>
          <td className={`text-center font-mono ${dA>0.03?'text-emerald-400':dA<-0.03?'text-red-400':'text-slate-400'}`}>{sgn(dA,3)}</td>
          <td className="text-center font-mono border-l border-slate-700/50">{dI.toFixed(2)}</td>
          <td className="text-center font-mono">{dF.toFixed(2)}</td>
          <td className={`text-center font-mono ${dD>0.03?'text-red-400':dD<-0.03?'text-emerald-400':'text-slate-400'}`}>{sgn(dD,3)}</td>
        </tr>);
      })}</tbody></table></div></details>
      <details className="mt-2"><summary className="text-xs text-emerald-400 cursor-pointer hover:underline">Matriz de posições completa (mapa de calor)</summary>
      <p className="text-[10px] text-slate-500 mt-1 mb-1 italic">Cada linha é um time, cada coluna uma posição final. Valores são % de simulações. Verde mais intenso = mais provável.</p>
      <div className="overflow-x-auto mt-2"><table className="text-[10px]"><thead><tr className="text-slate-400 border-b border-slate-700"><th className="text-left py-1 px-1 sticky left-0 bg-slate-900">Time</th>{Array.from({length:times.length},(_,i)=>(<th key={i} className="text-center py-1 px-0.5 min-w-[24px]">{i+1}°</th>))}</tr></thead><tbody>{rMC.probs.map(p=>(<tr key={p.time} className="border-b border-slate-700/20"><td className="py-0.5 px-1 font-medium sticky left-0 bg-slate-900 whitespace-nowrap"><TN name={p.time}/></td>{p.posF.map((v,pi)=>(<td key={pi} className="text-center px-0.5 font-mono transition-colors" style={{backgroundColor:heatColor(v/100)}} title={`${p.time} em ${pi+1}º: ${v.toFixed(1)}%`}>{v<0.5?'':Math.round(v)}</td>))}</tr>))}</tbody></table></div></details>
    </div>}</div>}
    {aba==='chaves'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">{!rMC?<p className="text-slate-400 text-center py-8">Rode "⚡ Simular Tudo" no dashboard acima para ver os cruzamentos.</p>:<div>
      <h2 className="text-base font-semibold text-emerald-300 mb-3">Cruzamentos mais prováveis <span className="text-slate-500 text-xs italic">· {rMC.nSims.toLocaleString()} sims</span></h2>
      {meta.key==='B'&&<MatchupsView probs={rMC.probs.filter(p=>(p.bPlayoff||0)>=1)} phases={[{key:'po',label:'Playoff',probKey:'bPlayoff'}]} sortKey="bPlayoff"/>}
      {meta.key==='C'&&<MatchupsView probs={rMC.probs.filter(p=>(p.g4||0)>=1)} phases={[{key:'quad',label:'Quadran.',probKey:'g4'},{key:'camp',label:'Final',probKey:'qChamp'}]} sortKey="g4"/>}
    </div>}</div>}
    {aba==='simU'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">{!rSU?<p className="text-slate-400 text-center py-8">Clique "1 Sim"</p>:<div><h2 className="text-base font-semibold text-emerald-300 mb-3">Simulação Única</h2><CT data={rSU.classificacao}/><h3 className="text-sm font-semibold text-slate-300 mt-4 mb-2">Jogos</h3><div className="space-y-0.5 max-h-[400px] overflow-y-auto">{rSU.jogos.map((j,i)=><GameRow key={i} j={j}/>)}</div></div>}</div>}
  </div>);
}

// ============================================================================
// SÉRIE D — idêntico v3 (resumido)
// ============================================================================
function SerieDSim({cfg,initialMC,initialAk,initialEo,initialDrift,extraRes}){
  const[aba,setAba]=useState('ratings');const[nS,setNS]=useState(500);const[eo,setEo]=useState(initialEo||false);const[ak,setAk]=useState(initialAk||cfg.defaultAlpha);
  const[rMC,setRMC]=useState(initialMC||null);const[rSU,setRSU]=useState(null);const[busy,setBusy]=useState(false);const[gF,setGF]=useState(-1);const[rF,setRF]=useState(0);const[gView,setGView]=useState('now');const[expSD,setExpSD]=useState({});
  const effCfg=useMemo(()=>({...cfg,drift:initialDrift!==undefined?initialDrift:cfg.drift||0}),[cfg,initialDrift]);
  useEffect(()=>{if(initialMC){setRMC(initialMC);if(initialAk)setAk(initialAk);if(initialEo!==undefined)setEo(initialEo);}},[initialMC,initialAk,initialEo]);
  const tabD=useMemo(()=>SD_REAL_TAB,[]);
  const lg=useMemo(()=>initLeague(SD_TIMES,t=>SD_INFO[t].elo,effCfg),[effCfg]);
  // Snapshot cacheado: estado pós-aplicação de todos os SD_RES (Elo/atk/def/standings).
  // Substitui a iteração tabD+find que ignorava 87% dos jogos reais (casa/fora trocados).
  const snap=useMemo(()=>prepareSerieDState(effCfg,eo,ak,extraRes),[effCfg,eo,ak,extraRes]);
  const sdR=useMemo(()=>SD_TIMES.map(t=>({time:t,uf:SD_INFO[t].uf,eloIni:SD_INFO[t].elo,elo:Math.round(snap.el[t]),dE:Math.round(snap.el[t]-SD_INFO[t].elo),atkIni:snap.atI[t],atk:snap.at[t],dA:snap.at[t]-snap.atI[t],defIni:snap.dfI[t],def:snap.df[t],dD:snap.df[t]-snap.dfI[t],ad:snap.at[t]/snap.df[t]})).sort((a,b)=>b.elo-a.elo),[snap]);
  const sdRSort=useSortable(sdR,'elo','desc');
  const sdMCSort=useSortable(rMC?rMC.probs:[],'ac','desc');
  const form=useMemo(()=>extractForm(SD_TIMES,extraRes&&extraRes.length?[...SD_RES,...extraRes.filter(r=>!SD_RES.some(e=>e.c===r.c&&e.f===r.f))]:SD_RES),[extraRes]);
  const[qR,setQR]=useState('');const[qM,setQM]=useState('');
  const sdRFiltered=useMemo(()=>filterByName(sdRSort.sorted,qR),[sdRSort.sorted,qR]);
  const sdMCFiltered=useMemo(()=>filterByName(sdMCSort.sorted,qM),[sdMCSort.sorted,qM]);
  const[progress,setProgress]=useState(0);
  const doMC=useCallback(()=>{setBusy(true);setProgress(0);
    simMC_D_async(cfg,nS,ak,eo,
      (done,total)=>setProgress(done/total),
      (result)=>{setRMC(result);setBusy(false);setProgress(1);});
  },[nS,effCfg,eo,ak]);
  const doSU=useCallback(()=>{const{mc,mf}=getML(effCfg,'D');const{el,at,df,st}=cloneSDState(snap);
    let lastDR=0;for(const j of tabD){if(snap.jogados.has(pairKey(j.casa,j.fora,j.rodada)))continue;
      if(j.rodada>lastDR&&j.rodada>snap.maxRR&&effCfg.drift>0){lastDR=j.rodada;applyDrift(SD_TIMES,el,at,df,effCfg.drift);}
      const{lC,lF}=calcL(at[j.casa],df[j.casa],at[j.fora],df[j.fora],el[j.casa],el[j.fora],mc,mf,effCfg.homeAdv,eo,effCfg.c0Log);
      const gc=poissonRandom(lC),gf=poissonRandom(lF);
      st[j.casa].J++;st[j.fora].J++;st[j.casa].GP+=gc;st[j.casa].GC+=gf;st[j.fora].GP+=gf;st[j.fora].GC+=gc;
      if(gc>gf){st[j.casa].V++;st[j.casa].P+=3;st[j.fora].D++;}else if(gc===gf){st[j.casa].E++;st[j.fora].E++;st[j.casa].P++;st[j.fora].P++;}else{st[j.fora].V++;st[j.fora].P+=3;st[j.casa].D++;}
      updR(el,at,df,j.casa,j.fora,gc,gf,lC,lF,effCfg,ak,eo);}
    const grupos=SD_GRUPOS.map((g,gi)=>({grupo:gi,times:g.map(t=>({time:t,...st[t],SG:st[t].GP-st[t].GC})).sort((a,b)=>b.P-a.P||b.V-a.V||b.SG-a.SG||b.GP-a.GP).map((c,i)=>({...c,pos:i+1}))}));
    const s180=(a,b)=>{const{lC,lF}=eo?(()=>{const d=el[a]-el[b];const e=1/(1+Math.pow(10,-d/400));return{lC:2*effCfg.mnMM*(0.5+e),lF:2*effCfg.mnMM*(0.5+(1-e))};})():{lC:Math.max(0.2,2*effCfg.mnMM*at[a]*df[b]),lF:Math.max(0.2,2*effCfg.mnMM*at[b]*df[a])};const ga=poissonRandom(lC),gb=poissonRandom(lF);return{a,b,ga,gb,w:ga>gb?a:gb>ga?b:Math.random()<0.5?a:b,pen:ga===gb};};
    const fases=[];const gc=grupos.map(g=>g.times.filter(t=>t.pos<=4).map(t=>t.time));
    let f2=[];for(const[gx,gy]of SD_PAIRS){f2.push(s180(gc[gx][0],gc[gy][3]));f2.push(s180(gc[gx][1],gc[gy][2]));f2.push(s180(gc[gy][0],gc[gx][3]));f2.push(s180(gc[gy][1],gc[gx][2]));}fases.push({n:'2ª Fase ('+SD_MM_DATES.f2+')',j:f2});
    let f3=[];for(const[p1,p2]of SD_SUPER)for(let j=0;j<4;j++)f3.push(s180(f2[p1*4+j].w,f2[p2*4+(3-j)].w));fases.push({n:'3ª Fase ('+SD_MM_DATES.f3+')',j:f3});
    const r16=[...f3.map(x=>x.w)].sort((a,b)=>st[b].P-st[a].P||(st[b].GP-st[b].GC)-(st[a].GP-st[a].GC));let oit=[];for(let i=0;i<8;i++)oit.push(s180(r16[i],r16[15-i]));fases.push({n:'Oitavas ('+SD_MM_DATES.oit+')',j:oit});
    const r8=[...oit.map(x=>x.w)].sort((a,b)=>st[b].P-st[a].P);let qrt=[];for(let i=0;i<4;i++)qrt.push(s180(r8[i],r8[7-i]));fases.push({n:'Quartas ('+SD_MM_DATES.qrt+')',j:qrt});
    const qW=qrt.map(x=>x.w),qL=qrt.map(x=>x.w===x.a?x.b:x.a);let semi=[s180(qW[0],qW[1]),s180(qW[2],qW[3])];fases.push({n:'Semi ('+SD_MM_DATES.semi+')',j:semi});
    let po=[s180(qL[0],qL[1]),s180(qL[2],qL[3])];fases.push({n:'Playoff ('+SD_MM_DATES.po+')',j:po});let fin=[s180(semi[0].w,semi[1].w)];fases.push({n:'Final ('+SD_MM_DATES.final+')',j:fin});
    setRSU({grupos,fases,prom:[...new Set([...qW,...po.map(x=>x.w)])],ch:fin[0].w});setAba('simU');
  },[effCfg,eo,ak,tabD,snap]);
  const gV=gF>=0?[gF]:SD_GRUPOS.map((_,i)=>i);
  return(<div>
    <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
      <span className="text-[10px] text-slate-500 italic mr-2">Para Monte Carlo, use "Simular Tudo" no dashboard acima.</span>
      <button onClick={doSU} className="px-4 py-1.5 bg-slate-700 rounded-lg text-xs border border-slate-600 hover:bg-slate-600 transition-colors">1 Sim rápido</button>
    </div>
    <div className="flex gap-1 mb-3 bg-slate-800/40 rounded-xl p-1">{[{id:'ratings',l:'Ratings'},{id:'jogos',l:'Jogos'},{id:'grupos',l:'Grupos'},{id:'mc',l:'Monte Carlo'},{id:'chaves',l:'Chaves'},{id:'simU',l:'1 Sim'}].map(t=>(<button key={t.id} onClick={()=>setAba(t.id)} className={`flex-1 py-1.5 px-1 rounded-lg text-xs font-medium ${aba===t.id?'bg-emerald-600/80 text-white shadow':'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>{t.l}</button>))}</div>
    {aba==='ratings'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50"><h2 className="text-base font-semibold text-emerald-300 mb-1">96 Times (spread={lg.spread.toFixed(2)})</h2><p className="text-xs text-slate-500 mb-2 italic">Clique nos cabeçalhos para ordenar</p>
    <TableToolbar query={qR} setQuery={setQR} showing={sdRFiltered.length} total={sdRSort.sorted.length}
      onExport={()=>exportCSV(sdRFiltered,[{label:'Time',key:'time'},{label:'UF',key:'uf'},{label:'ELO ini',key:'eloIni'},{label:'ELO atual',key:'elo'},{label:'Delta',key:'dE'},{label:'ATK',key:'atk'},{label:'DEF',key:'def'},{label:'A/D',key:'ad'}],'ratings_D.csv')}/>
    <div className="overflow-x-auto max-h-[500px]"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-900"><tr className="border-b border-slate-700">
      <th className="text-left py-1 w-6 text-slate-500">#</th>
      <SortHeader k="time" label="Time" sort={sdRSort.sort} onClick={sdRSort.toggle} className="py-1"/>
      <SortHeader k="eloIni" label="ELO ini" sort={sdRSort.sort} onClick={sdRSort.toggle} align="right" className="py-1"/>
      <SortHeader k="elo" label="ELO atual" sort={sdRSort.sort} onClick={sdRSort.toggle} align="right" className="py-1"/>
      <SortHeader k="dE" label="±" sort={sdRSort.sort} onClick={sdRSort.toggle} align="right" className="py-1"/>
      <th className="text-center py-1 text-slate-400" title="Últimos 5 resultados">Forma</th>
      <SortHeader k="atk" label="ATK" sort={sdRSort.sort} onClick={sdRSort.toggle} align="right" className="py-1"/>
      <SortHeader k="def" label="DEF" sort={sdRSort.sort} onClick={sdRSort.toggle} align="right" className="py-1"/>
      <SortHeader k="ad" label="A/D" sort={sdRSort.sort} onClick={sdRSort.toggle} align="right" className="py-1"/>
    </tr></thead><tbody>{sdRFiltered.map((r,i)=>(<tr key={r.time} className="border-b border-slate-700/20 hover:bg-slate-700/30 transition-colors"><td className="py-0.5 pl-1 text-slate-500">{i+1}</td><td className="py-0.5 font-medium"><TN name={r.time}/></td><td className="text-right font-mono text-slate-400">{r.eloIni}</td><td className="text-right font-mono font-bold text-emerald-300">{r.elo}</td><td className={"text-right font-mono text-[10px] "+(r.dE>0?"text-green-400":r.dE<0?"text-red-400":"text-slate-600")}>{r.dE>0?"+":""}{r.dE||""}</td><td className="text-center"><FormStreak results={form[r.time]}/></td><td className={`text-right font-mono ${r.atk>1.1?'text-green-400':'text-slate-400'}`}>{r.atk.toFixed(2)}</td><td className={`text-right font-mono ${r.def<0.9?'text-green-400':'text-slate-400'}`}>{r.def.toFixed(2)}</td><td className="text-right font-mono font-bold text-slate-300">{r.ad.toFixed(2)}</td></tr>))}</tbody></table></div></div>}
    {aba==='jogos'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50"><div className="flex items-center justify-between mb-3 flex-wrap gap-2"><h2 className="text-base font-semibold text-emerald-300">Jogos Grupos</h2>
      <div className="flex items-center gap-2 flex-wrap">
        <select value={rF} onChange={e=>setRF(Number(e.target.value))} className="bg-slate-700 text-white text-xs rounded-lg px-2 py-1 border border-slate-600">
          <option value={0}>Próxima rodada</option>
          <option value={-1}>Todas rodadas</option>
          {Array.from({length:10},(_,i)=>i+1).map(r=>{
            const dt=(tabD.find(j=>j.rodada===r)||{}).data||'';
            return <option key={r} value={r}>R{r}{dt?` (${dt})`:''}</option>;
          })}
        </select>
        <select value={gF} onChange={e=>setGF(Number(e.target.value))} className="bg-slate-700 text-white text-xs rounded-lg px-2 py-1 border border-slate-600"><option value={-1}>Todos grupos</option>{SD_GRUPOS.map((_,i)=><option key={i} value={i}>{SD_GL[i]}</option>)}</select>
      </div></div>
      {(()=>{
        // rF=0 → próxima rodada (primeira que tem ao menos um jogo não disputado).
        // rF=-1 → todas; rF>0 → rodada específica.
        let rodadaAlvo=rF;
        if(rF===0){
          for(let r=1;r<=10;r++){
            const jogosR=tabD.filter(j=>j.rodada===r);
            const naoJogados=jogosR.filter(j=>!SD_RES.find(re=>re.c===j.casa&&re.f===j.fora&&re.r===j.rodada));
            if(naoJogados.length>0){rodadaAlvo=r;break;}
          }
        }
        const filtered=tabD.filter(j=>(rF===-1||j.rodada===rodadaAlvo)&&(gF<0||j.grupo===gF));
        return(<div className="space-y-0.5 max-h-[500px] overflow-y-auto">{filtered.map((j,i)=>{const rc=sdR.find(x=>x.time===j.casa),rf=sdR.find(x=>x.time===j.fora);let prob=null;if(rc&&rf){const{mc:m1,mf:m2}=getML(cfg,'D');const{lC,lF}=calcL(rc.atk,rc.def,rf.atk,rf.def,rc.elo,rf.elo,m1,m2,cfg.homeAdv,eo,cfg.c0Log);prob=calcProbs(lC,lF);}
          // SD_REAL_TAB tem mando casa/fora idêntico ao calendário oficial CBF, então a busca é exata.
          const rl=SD_RES.find(r=>r.c===j.casa&&r.f===j.fora&&r.r===j.rodada);
          return(<div key={i} className="flex items-center justify-between p-1 rounded text-xs bg-slate-700/30">{j.data&&<span className="text-slate-600 w-12 text-[10px]">{j.data}</span>}<span className="text-slate-500 w-6 text-right font-mono">R{j.rodada}</span><span className="text-slate-600 w-10 text-center text-[10px]">{SD_GL[j.grupo].split('·')[0]}</span>{rl?
            <span className="flex items-center flex-1"><span className="flex-1 text-right truncate pr-1"><TN name={j.casa}/></span><span className="mx-1 w-12 text-center font-mono font-bold text-emerald-300">{rl.gc} x {rl.gf}</span><span className="flex-1 truncate pl-1"><TN name={j.fora}/></span><span className="text-emerald-400 text-[10px] ml-1">✓</span></span>
            :<span className="flex items-center flex-1">{prob&&<span className="text-blue-400 w-7 text-right text-[10px] font-mono">{Math.round(prob.pH)}%</span>}<span className="flex-1 text-right truncate pr-1"><TN name={j.casa}/></span><span className="mx-1 w-8 text-center text-slate-500 text-[10px]">{prob?Math.round(prob.pD)+'%':'vs'}</span><span className="flex-1 truncate pl-1"><TN name={j.fora}/></span>{prob&&<span className="text-orange-400 w-7 text-[10px] font-mono">{Math.round(prob.pA)}%</span>}</span>}</div>);})}</div>);
      })()}</div>}
    {aba==='grupos'&&<div className="flex gap-1 mb-3 bg-slate-800/40 rounded-xl p-1 max-w-sm">{[{id:'now',l:'Classificação atual'},{id:'mc',l:'Probabilidades'}].map(t=>(<button key={t.id} onClick={()=>setGView(t.id)} className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium ${gView===t.id?'bg-emerald-600/80 text-white shadow':'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>{t.l}</button>))}</div>}
    {aba==='grupos'&&gView==='now'&&<div><div className="mb-3"><select value={gF} onChange={e=>setGF(Number(e.target.value))} className="bg-slate-700 text-white text-xs rounded-lg px-2 py-1 border border-slate-600"><option value={-1}>Todos</option>{SD_GRUPOS.map((_,i)=><option key={i} value={i}>{SD_GL[i]}</option>)}</select></div>
      {(()=>{
        // Calcula classificação real de cada grupo da Série D, processando SD_RES.
        // Cada time inicia com 0 pts e estatísticas zeradas; aplicamos jogo a jogo.
        // Nota: grupos da D têm 6 times cada (não os 96 da liga inteira), filtramos por grupo.
        const computeGrpStandings=(grupo)=>{
          const st={};grupo.forEach(t=>{st[t]={time:t,P:0,J:0,V:0,E:0,D:0,GP:0,GC:0,SG:0};});
          SD_RES.forEach(r=>{
            if(!st[r.c]||!st[r.f])return; // jogo fora deste grupo
            st[r.c].J++;st[r.f].J++;st[r.c].GP+=r.gc;st[r.c].GC+=r.gf;st[r.f].GP+=r.gf;st[r.f].GC+=r.gc;
            if(r.gc>r.gf){st[r.c].V++;st[r.c].P+=3;st[r.f].D++;}
            else if(r.gc===r.gf){st[r.c].E++;st[r.f].E++;st[r.c].P++;st[r.f].P++;}
            else{st[r.f].V++;st[r.f].P+=3;st[r.c].D++;}
          });
          grupo.forEach(t=>{st[t].SG=st[t].GP-st[t].GC;});
          return Object.values(st).sort((a,b)=>b.P-a.P||b.V-a.V||b.SG-a.SG||b.GP-a.GP);
        };
        return(<div className="grid grid-cols-1 md:grid-cols-2 gap-3">{gV.map(gi=>{
          const tab=computeGrpStandings(SD_GRUPOS[gi]);
          return(<div key={gi} className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">
            <h3 className="text-xs font-bold text-emerald-300 mb-2">{SD_GL[gi]}</h3>
            <table className="w-full text-[10px]"><thead><tr className="text-slate-500 border-b border-slate-700/50">
              <th className="text-left py-0.5 w-4">#</th>
              <th className="text-left py-0.5">Time</th>
              <th className="text-center py-0.5 w-6 font-bold text-emerald-400">P</th>
              <th className="text-center py-0.5 w-5">J</th>
              <th className="text-center py-0.5 w-5 text-green-500">V</th>
              <th className="text-center py-0.5 w-5 text-yellow-500">E</th>
              <th className="text-center py-0.5 w-5 text-red-500">D</th>
              <th className="text-center py-0.5 w-6">SG</th>
              <th className="text-right py-0.5 w-10 text-emerald-400">Elo</th>
            </tr></thead><tbody>{tab.map((c,ti)=>(
              <tr key={c.time} className={ti<4?'bg-blue-900/15 border-b border-slate-700/20':'border-b border-slate-700/20'}>
                <td className="text-slate-500 py-0.5">{ti+1}</td>
                <td className="font-medium py-0.5"><TN name={c.time}/></td>
                <td className="text-center font-bold text-emerald-300">{c.P}</td>
                <td className="text-center text-slate-400">{c.J}</td>
                <td className="text-center text-green-400">{c.V}</td>
                <td className="text-center text-yellow-400">{c.E}</td>
                <td className="text-center text-red-400">{c.D}</td>
                <td className={`text-center font-medium ${c.SG>0?'text-green-400':c.SG<0?'text-red-400':'text-slate-400'}`}>{c.SG>0?'+':''}{c.SG}</td>
                <td className="text-right font-mono text-emerald-400">{SD_INFO[c.time].elo}</td>
              </tr>))}</tbody></table>
          </div>);
        })}</div>);
      })()}
      <details className="mt-3"><summary className="text-xs text-emerald-400 cursor-pointer hover:underline">Lógica de cruzamentos (mata-mata)</summary>
      <div className="mt-2 text-xs text-slate-400 space-y-1 bg-slate-900/50 rounded-lg p-3">
        <p className="text-slate-300 font-medium">Pareamento por fase:</p>
        <p><span className="text-emerald-300">2ª Fase (64→32):</span> Cruzamento entre grupos pareados (A1×A2, A3×A4, ...A15×A16). 1°Gx × 4°Gy, 2°Gx × 3°Gy, 1°Gy × 4°Gx, 2°Gy × 3°Gx = 4 confrontos por par.</p>
        <p><span className="text-emerald-300">3ª Fase (32→16):</span> Cruzamento entre super-grupos: pares (A1×A2)↔(A3×A4), (A5×A6)↔(A7×A8), (A9×A10)↔(A11×A12), (A13×A14)↔(A15×A16). Vencedor j do par1 × vencedor (3-j) do par2.</p>
        <p><span className="text-emerald-300">Oitavas (16→8):</span> Reseed por campanha na fase de grupos (pts → vitórias → SG → GP). 1°×16°, 2°×15°, ..., 8°×9°.</p>
        <p><span className="text-emerald-300">Quartas (8→4):</span> Reseed por campanha. 1°×8°, 2°×7°, 3°×6°, 4°×5°.</p>
        <p><span className="text-emerald-300">Semi:</span> Chaveamento fixo: Q1×Q2, Q3×Q4.</p>
        <p><span className="text-emerald-300">Playoff Acesso:</span> Eliminados das quartas: QP1×QP2, QP3×QP4 → 2 vagas extras.</p>
        <p><span className="text-emerald-300">Final:</span> Vencedor Semi1 × Vencedor Semi2. Todos mata-mata = 180min neutro, empate = pênaltis.</p>
        <p className="text-blue-300 font-medium mt-2">6 acessos à Série C: 4 semifinalistas + 2 vencedores playoff.</p>
      </div></details>
    </div>}
    {aba==='grupos'&&gView==='mc'&&<div>{!rMC?<p className="text-slate-400 text-center py-8">Rode "⚡ Simular Tudo" no dashboard acima para ver as probabilidades por grupo.</p>:<>
      <div className="mb-3"><select value={gF} onChange={e=>setGF(Number(e.target.value))} className="bg-slate-700 text-white text-xs rounded-lg px-2 py-1 border border-slate-600"><option value={-1}>Todos</option>{SD_GRUPOS.map((_,i)=><option key={i} value={i}>{SD_GL[i]}</option>)}</select></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{gV.map(gi=>{const ts=rMC.probs.filter(p=>p.grupo===gi).sort((a,b)=>(b.ac||0)-(a.ac||0)||(b.f2||0)-(a.f2||0));const fmt=(v)=>v==null?'—':v<0.5&&v>0?'<1':Math.round(v);const cuts=rMC.ptsCutsByGroup?rMC.ptsCutsByGroup[gi]:null;
        return(<div key={gi} className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50">
          <h3 className="text-xs font-bold text-emerald-300 mb-1">{SD_GL[gi]}</h3>
          {cuts&&<div className="mb-2 text-[9px] text-slate-400"><span className="text-slate-500">Corte de pts (p50): </span>{[0,1,2,3].map(pos=><span key={pos} className="mr-2">{pos+1}º <span className="font-mono text-slate-300">{cuts[pos]?cuts[pos].p50:'—'}</span></span>)}</div>}
          <table className="w-full text-[10px]"><thead><tr className="text-slate-500 border-b border-slate-700/50"><th className="text-left py-0.5">Time</th><th className="text-center py-0.5 w-9">1°Gr</th><th className="text-center py-0.5 w-10 text-emerald-400">Classif</th><th className="text-center py-0.5 w-10 text-blue-300">Acesso</th><th className="text-center py-0.5 w-8 text-yellow-400">Tít</th></tr></thead>
          <tbody>{ts.map(p=>{const open=!!expSD[p.time];return(<React.Fragment key={p.time}>
            <tr className="border-b border-slate-700/20 cursor-pointer hover:bg-slate-700/30" onClick={()=>setExpSD(s=>({...s,[p.time]:!s[p.time]}))}>
              <td className="font-medium py-0.5"><span className="text-slate-500 mr-0.5 text-[8px]">{open?'▾':'▸'}</span><TN name={p.time}/></td>
              <td className="text-center text-slate-300">{fmt(p.grupoTop1)}</td>
              <td className="text-center text-emerald-300">{fmt(p.f2)}</td>
              <td className="text-center font-bold text-blue-400">{fmt(p.ac)}</td>
              <td className="text-center text-yellow-400">{fmt(p.ch)}</td>
            </tr>
            {open&&<tr className="bg-slate-900/40 border-b border-slate-700/20"><td colSpan={5} className="px-2 py-1.5">
              <div className="space-y-0.5 text-[9px] text-slate-400">
                <div>Pts <span className="text-slate-600">(p10/p50/p90):</span> <span className="font-mono text-slate-200">{p.p10Pts} / {p.medianPts} / {p.p90Pts}</span></div>
                <div className="flex gap-2">{[0,1,2,3].map(pos=><span key={pos}>{pos+1}º <span className="font-mono text-slate-200">{fmt(p.posGr[pos])}%</span></span>)}</div>
                <div>F3 <span className="font-mono text-slate-200">{fmt(p.f3)}%</span> · Oit <span className="font-mono text-slate-200">{fmt(p.oit)}%</span> · QF <span className="font-mono text-slate-200">{fmt(p.qf)}%</span></div>
              </div>
            </td></tr>}
          </React.Fragment>);})}</tbody></table>
        </div>);})}</div>
      <p className="text-[10px] text-slate-500 mt-2 italic">Clique num time para abrir pts (p10/p50/p90), posição final no grupo (1º-4º) e chance por fase (F3/Oit/QF). "Corte de pts" = pontos medianos de quem terminou em cada posição do grupo. 1°Gr = líder · Classif = top-4 (avança) · Acesso = sobe à Série C · Tít = campeão.</p>
    </>}</div>}
    {aba==='mc'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">{!rMC?<p className="text-slate-400 text-center py-8">Rode "⚡ Simular Tudo" no dashboard acima para ver os resultados Monte Carlo.</p>:<div>
    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
      <h2 className="text-base font-semibold text-emerald-300">{rMC.nSims.toLocaleString()} sims <span className="text-slate-500 text-xs italic">· clique cabeçalhos para ordenar</span></h2>
    </div>
    <TableToolbar query={qM} setQuery={setQM} showing={sdMCFiltered.length} total={sdMCSort.sorted.length}
      onExport={()=>exportCSV(sdMCFiltered,[{label:'Time',key:'time'},{label:'UF',key:'uf'},{label:'Grupo',fn:r=>SD_GL[r.grupo]},{label:'ELO atual',key:'eloAtual'},{label:'Top1Gr%',key:'grupoTop1'},{label:'F2%',key:'f2'},{label:'F3%',key:'f3'},{label:'Oit%',key:'oit'},{label:'QF%',key:'qf'},{label:'SF%',key:'sf'},{label:'Fin%',key:'fin'},{label:'Ac%',key:'ac'},{label:'Titulo%',key:'ch'}],gF>=0?`mc_D_grupo${gF+1}.csv`:'mc_D.csv')}/>
    <div className="overflow-x-auto max-h-[500px]"><table className="w-full text-[11px]"><thead className="sticky top-0 bg-slate-900"><tr className="border-b border-slate-700">
      <th className="text-left py-1 w-6 text-slate-500">#</th>
      <SortHeader k="time" label="Time" sort={sdMCSort.sort} onClick={sdMCSort.toggle} className="py-1"/>
      <SortHeader k="grupo" label="Gr" sort={sdMCSort.sort} onClick={sdMCSort.toggle} align="center" className="py-1"/>
      <SortHeader k="eloAtual" label="ELO atual" sort={sdMCSort.sort} onClick={sdMCSort.toggle} align="right" className="py-1"/>
      <SortHeader k="grupoTop1" label="1°Gr%" sort={sdMCSort.sort} onClick={sdMCSort.toggle} align="center" className="py-1"/>
      <SortHeader k="f2" label="F2%" sort={sdMCSort.sort} onClick={sdMCSort.toggle} align="center" className="py-1"/>
      <SortHeader k="f3" label="F3%" sort={sdMCSort.sort} onClick={sdMCSort.toggle} align="center" className="py-1"/>
      <SortHeader k="oit" label="Oit%" sort={sdMCSort.sort} onClick={sdMCSort.toggle} align="center" className="py-1"/>
      <SortHeader k="qf" label="QF%" sort={sdMCSort.sort} onClick={sdMCSort.toggle} align="center" className="py-1"/>
      <SortHeader k="sf" label="SF%" sort={sdMCSort.sort} onClick={sdMCSort.toggle} align="center" className="py-1"/>
      <SortHeader k="fin" label="Fin%" sort={sdMCSort.sort} onClick={sdMCSort.toggle} align="center" className="py-1"/>
      <SortHeader k="ac" label="Ac%" sort={sdMCSort.sort} onClick={sdMCSort.toggle} align="center" className="py-1"/>
      <SortHeader k="ch" label="T%" sort={sdMCSort.sort} onClick={sdMCSort.toggle} align="center" className="py-1"/>
    </tr></thead><tbody>{sdMCFiltered.map((p,i)=>{const fmt=(v)=>v==null?'—':v<0.5&&v>0?'<1':Math.round(v);return(<tr key={p.time} className="border-b border-slate-700/20 hover:bg-slate-700/30 transition-colors">
      <td className="py-0.5 pl-1 text-slate-500">{i+1}</td>
      <td className="py-0.5 font-medium"><TN name={p.time}/></td>
      <td className="text-center text-slate-500 text-[10px]">{p.grupo!=null?SD_GL[p.grupo].split('·')[0]:'—'}</td>
      <td className="text-right font-mono text-emerald-300">{p.eloAtual||p.elo}</td>
      <td className="text-center text-slate-300">{fmt(p.grupoTop1)}</td>
      <td className="text-center text-emerald-300">{fmt(p.f2)}</td>
      <td className="text-center text-emerald-200">{fmt(p.f3)}</td>
      <td className="text-center text-slate-400">{fmt(p.oit)}</td>
      <td className="text-center text-slate-300">{fmt(p.qf)}</td>
      <td className="text-center text-slate-300">{fmt(p.sf)}</td>
      <td className="text-center text-blue-300">{fmt(p.fin)}</td>
      <td className="text-center font-bold text-blue-400">{fmt(p.ac)}</td>
      <td className="text-center text-yellow-400">{fmt(p.ch)}</td>
    </tr>);})}</tbody></table></div>
    <p className="text-[10px] text-slate-500 mt-2 italic">Cl = passou da 1ª fase (top-4 do grupo) · 1°Gr = líder do grupo · F2/Oit/QF/SF/Fin = chegou à fase · Ac = acesso à Série C · T = campeão.</p>

    <details className="mt-3"><summary className="text-xs text-emerald-400 cursor-pointer hover:underline">Evolução atk / def / Elo — inicial → final</summary>
    <p className="text-[10px] text-slate-500 mt-1 mb-2 italic">atk maior = melhor ataque. def maior = mais vulnerável. Iniciais = pós-rodadas reais (R3). Finais = média sobre {rMC.nSims.toLocaleString()} simulações.</p>
    <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead><tr className="text-slate-400 border-b border-slate-700">
      <th className="text-left py-1 px-1">Time</th>
      <th className="text-center py-1 px-1" colSpan="3">ELO</th>
      <th className="text-center py-1 px-1 border-l border-slate-700/50" colSpan="3">ATK</th>
      <th className="text-center py-1 px-1 border-l border-slate-700/50" colSpan="3">DEF</th>
    </tr><tr className="text-slate-500 border-b border-slate-700/50 text-[10px]">
      <th></th>
      <th className="text-center">ini</th><th className="text-center">fim</th><th className="text-center">Δ</th>
      <th className="text-center border-l border-slate-700/50">ini</th><th className="text-center">fim</th><th className="text-center">Δ</th>
      <th className="text-center border-l border-slate-700/50">ini</th><th className="text-center">fim</th><th className="text-center">Δ</th>
    </tr></thead><tbody>{sdMCFiltered.map(p=>{
      const eI=p.eloAtual||p.elo,eF=p.eloFinal||eI,dE=eF-eI;
      const aI=p.atk||0,aF=p.atkFinal!=null?p.atkFinal:aI,dA=aF-aI;
      const dI=p.def||0,dF=p.defFinal!=null?p.defFinal:dI,dD=dF-dI;
      const sgn=(v,fmt=2)=>(v>=0?'+':'')+v.toFixed(fmt);
      return(<tr key={p.time} className="border-b border-slate-700/20 hover:bg-slate-700/20">
        <td className="py-0.5 px-1 font-medium"><TN name={p.time}/></td>
        <td className="text-center font-mono">{eI}</td><td className="text-center font-mono">{eF}</td><td className={`text-center font-mono ${dE>5?'text-emerald-400':dE<-5?'text-red-400':'text-slate-400'}`}>{sgn(dE,0)}</td>
        <td className="text-center font-mono border-l border-slate-700/50">{aI.toFixed(2)}</td><td className="text-center font-mono">{aF.toFixed(2)}</td><td className={`text-center font-mono ${dA>0.03?'text-emerald-400':dA<-0.03?'text-red-400':'text-slate-400'}`}>{sgn(dA,3)}</td>
        <td className="text-center font-mono border-l border-slate-700/50">{dI.toFixed(2)}</td><td className="text-center font-mono">{dF.toFixed(2)}</td><td className={`text-center font-mono ${dD>0.03?'text-red-400':dD<-0.03?'text-emerald-400':'text-slate-400'}`}>{sgn(dD,3)}</td>
      </tr>);
    })}</tbody></table></div></details>

    <details className="mt-3"><summary className="text-xs text-emerald-400 cursor-pointer hover:underline">Visão por Grupo — detalhe de posição e pontuação {gF>=0&&<span className="text-slate-400">(filtrado: {SD_GL[gF]})</span>}</summary>
    {(()=>{
      const cuts=rMC.ptsCutsByGroup;
      // Respeita o filtro de grupo (gF) do topo da aba MC. gF=-1 mostra todos os 16 grupos.
      const grupoIndices=gF>=0?[gF]:SD_GRUPOS.map((_,i)=>i);
      return(<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">{grupoIndices.map(gi=>{
        const grupo=SD_GRUPOS[gi];
        const times=grupo.map(t=>rMC.probs.find(p=>p.time===t)).filter(Boolean).sort((a,b)=>b.ac-a.ac);
        const gc=cuts&&cuts[gi];
        return(
          <div key={gi} className="bg-slate-900/40 rounded-xl p-3 border border-slate-700/40">
            <h4 className="text-xs font-bold text-emerald-300 mb-2">{SD_GL[gi]}</h4>
            {gc&&<div className="mb-2 p-2 bg-slate-800/40 rounded-lg border border-slate-700/40">
              <div className="text-[9px] text-slate-500 mb-1 uppercase tracking-wider font-semibold">Cortes esperados de pontos · p10 / p50 / p90</div>
              <div className="grid grid-cols-4 gap-1 text-[10px]">{[0,1,2,3].map(pos=>(
                <div key={pos} className="text-center bg-slate-900/40 rounded py-0.5 px-1 border border-slate-700/30">
                  <div className="text-emerald-400 font-bold">{pos+1}º</div>
                  <div className="font-mono text-slate-300">{gc[pos].p10}/<span className="text-emerald-200">{gc[pos].p50}</span>/{gc[pos].p90}</div>
                </div>
              ))}</div>
            </div>}
            <table className="w-full text-[10px]"><thead><tr className="text-slate-500 border-b border-slate-700/50"><th className="text-left py-0.5">Time</th><th className="text-center py-0.5 w-20 text-emerald-300" title="Pontos esperados na fase de grupos (10 jogos): p10 / p50 / p90 das simulações">Pts (p10/p50/p90)</th><th className="text-center py-0.5 text-emerald-500" title="Probabilidade de terminar em cada posição do grupo">1º</th><th className="text-center py-0.5 text-emerald-500">2º</th><th className="text-center py-0.5 text-emerald-500">3º</th><th className="text-center py-0.5 text-emerald-500">4º</th><th className="text-center py-0.5 text-slate-600">5º</th><th className="text-center py-0.5 text-slate-600">6º</th><th className="text-center py-0.5 text-blue-400">Ac%</th><th className="text-center py-0.5 text-yellow-400">T%</th></tr></thead>
            <tbody>{times.map(p=>{
              const fmtPos=(v)=>v==null?'—':v<0.5&&v>0?'<1':Math.round(v);
              const colorPos=(v,isClass)=>{
                if(v<1)return 'text-slate-700';
                if(isClass)return v>50?'text-emerald-300 font-bold':v>20?'text-emerald-400':'text-slate-400';
                return v>50?'text-red-400 font-bold':v>20?'text-amber-400':'text-slate-500';
              };
              const pg=p.posGr||[0,0,0,0,0,0];
              return(
              <tr key={p.time} className="border-b border-slate-700/20">
                <td className="py-0.5 font-medium"><TN name={p.time}/></td>
                <td className="text-center font-mono"><span className="text-slate-500">{p.p10Pts||0}</span><span className="text-slate-600">/</span><span className="text-emerald-200 font-bold">{p.medianPts||0}</span><span className="text-slate-600">/</span><span className="text-slate-500">{p.p90Pts||0}</span></td>
                <td className={`text-center font-mono ${colorPos(pg[0],true)}`}>{fmtPos(pg[0])}</td>
                <td className={`text-center font-mono ${colorPos(pg[1],true)}`}>{fmtPos(pg[1])}</td>
                <td className={`text-center font-mono ${colorPos(pg[2],true)}`}>{fmtPos(pg[2])}</td>
                <td className={`text-center font-mono ${colorPos(pg[3],true)}`}>{fmtPos(pg[3])}</td>
                <td className={`text-center font-mono ${colorPos(pg[4],false)}`}>{fmtPos(pg[4])}</td>
                <td className={`text-center font-mono ${colorPos(pg[5],false)}`}>{fmtPos(pg[5])}</td>
                <td className="text-center font-mono text-blue-400">{p.ac<0.5&&p.ac>0?'<1':Math.round(p.ac)}</td>
                <td className="text-center font-mono text-yellow-400">{p.ch<0.5&&p.ch>0?'<1':Math.round(p.ch)}</td>
              </tr>);
            })}</tbody></table>
          </div>
        );
      })}</div>);
    })()}
    <p className="text-[10px] text-slate-500 mt-2 italic">Cortes mostram a pontuação que tipicamente classifica em cada posição (p10 = pessimista, p50 = mediana, p90 = otimista).</p>
    </details>
    </div>}</div>}
    {aba==='chaves'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">{!rMC?<p className="text-slate-400 text-center py-8">Rode "⚡ Simular Tudo" no dashboard acima para ver os cruzamentos.</p>:<div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-semibold text-emerald-300">Cruzamentos mais prováveis <span className="text-slate-500 text-xs italic">· {rMC.nSims.toLocaleString()} sims</span></h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Grupo:</span>
          <select value={gF} onChange={e=>setGF(Number(e.target.value))} className="bg-slate-700 text-white text-xs rounded-lg px-2 py-1 border border-slate-600">
            <option value={-1}>Todos (96 times)</option>
            {SD_GRUPOS.map((_,i)=><option key={i} value={i}>{SD_GL[i]}</option>)}
          </select>
        </div>
      </div>
      <MatchupsView
        probs={rMC.probs.filter(p=>(p.f2||0)>=1&&(gF<0||p.grupo===gF))}
        phases={[
          {key:'f2',label:'2ª Fase',probKey:'f2'},
          {key:'f3',label:'3ª Fase',probKey:'f3'},
          {key:'oit',label:'Oitavas',probKey:'oit'},
          {key:'qf',label:'Quartas',probKey:'qf'},
          {key:'sf',label:'Semi',probKey:'sf'},
          {key:'po',label:'Playoff',probKey:'ac'},
          {key:'fin',label:'Final',probKey:'fin'}
        ]}
        sortKey="ac"
      />
    </div>}</div>}
    {aba==='simU'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">{!rSU?<p className="text-slate-400 text-center py-8">Clique 1 Sim</p>:<div><div className="mb-3 p-3 bg-emerald-900/30 rounded-xl border border-emerald-600/30 text-center"><span className="text-emerald-300 font-bold">Campeão: <TN name={rSU.ch}/></span><span className="text-slate-400 mx-3">|</span><span className="text-blue-300 text-xs">Promovidos: {rSU.prom.map((t,i)=><span key={i}>{i>0?", ":""}<TN name={t}/></span>)}</span></div><div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">{rSU.grupos.map((g,gi)=>(<div key={gi} className="bg-slate-900/30 rounded-lg p-2 border border-slate-700/30"><h4 className="text-[10px] font-bold text-emerald-300 mb-1">{SD_GL[gi]}</h4>{g.times.map(t=>(<div key={t.time} className={`flex text-[10px] gap-1 ${t.pos<=4?'text-blue-300':'text-slate-400'}`}><span className="w-3">{t.pos}</span><span className="flex-1"><TN name={t.time}/></span><span className="font-mono w-4 text-right">{t.P}</span></div>))}</div>))}</div>{rSU.fases.map(f=>(<div key={f.n} className="mb-2"><h4 className="text-xs font-bold text-emerald-400 mb-1">{f.n}</h4><div className="space-y-0.5">{f.j.map((j,i)=>(<div key={i} className="flex items-center text-xs bg-slate-700/30 rounded p-1"><span className={`flex-1 text-right pr-1 ${j.w===j.a?'text-emerald-300 font-bold':'text-slate-400'}`}><TN name={j.a}/></span><span className="font-mono w-14 text-center">{j.ga}x{j.gb}{j.pen?' pen':''}</span><span className={`flex-1 pl-1 ${j.w===j.b?'text-emerald-300 font-bold':'text-slate-400'}`}><TN name={j.b}/></span></div>))}</div></div>))}</div>}</div>}
  </div>);
}

// ============================================================================
// COPA DO BRASIL — bracket 32 times, ida/volta + final neutra
// ============================================================================
function CopaBrasilSim({cfg,allElos,allTeams,initialMC,initialAk,initialEo,initialDrift}){
  const[aba,setAba]=useState('ratings');const[nS,setNS]=useState(1000);const[eo,setEo]=useState(initialEo||false);const[ak,setAk]=useState(initialAk||cfg.defaultAlpha);
  // cbScores inicializado a partir dos resultados reais. Mapeamento:
  //   IDA: a=mandante, b=visitante → g1a=ida.ga, g1b=ida.gb
  //   VOLTA: b=mandante, a=visitante → g2b=volta.ga, g2a=volta.gb (mando inverte)
  const[cbScores,setCbScores]=useState(()=>{const init={};CB_R32.forEach((_,idx)=>{const ida=CB_RES_IDA[idx],volta=CB_RES_VOLTA[idx];if(ida||volta){init[idx]={g1a:ida?ida.ga:null,g1b:ida?ida.gb:null,g2a:volta?volta.gb:null,g2b:volta?volta.ga:null};}});return init;});
  const[cb16Scores,setCb16Scores]=useState({});
  const[rMC,setRMC]=useState(initialMC||null);const[rSU,setRSU]=useState(null);const[busy,setBusy]=useState(false);
  const effCfg=useMemo(()=>({...cfg,drift:initialDrift!==undefined?initialDrift:cfg.drift||0}),[cfg,initialDrift]);
  useEffect(()=>{if(initialMC){setRMC(initialMC);if(initialAk)setAk(initialAk);if(initialEo!==undefined)setEo(initialEo);}},[initialMC,initialAk,initialEo]);
  const teams=CB_TEAMS;const elos=useMemo(()=>{const e={};teams.forEach(t=>e[t]=allElos[t]||CB_ELOS[t]||1200);return e;},[teams,allElos]);
  const lg=useMemo(()=>initLeague(teams,t=>elos[t],cfg),[teams,elos,cfg]);
  // ranks: usa atk/def EVOLUÍDOS de allTeams quando disponível (estado pós resultados
  // reais de A/B/C/D + CB ida). Fallback para lg.initAD(elo) caso o time não esteja
  // em allTeams (ex: mismatch de nome como "Barra-SC" vs "Barra" do SC_RANKING).
  // Também calcula valores INICIAIS (CB_ELOS + lg.initAD do nominal) e Δs para
  // alinhar com o padrão de aba ratings das outras séries.
  const ranks=useMemo(()=>teams.map(t=>{
    const tt=allTeams&&allTeams[t];
    const elo=elos[t];
    const eloIni=CB_ELOS[t]||elo;
    const initI=lg.initAD(eloIni);
    const at=tt?tt.atk:lg.initAD(elo).atk;
    const df=tt?tt.def:lg.initAD(elo).def;
    return{time:t,eloIni:Math.round(eloIni),elo:Math.round(elo),dE:Math.round(elo-eloIni),
      atkIni:initI.atk,atk:at,dA:at-initI.atk,
      defIni:initI.def,def:df,dD:df-initI.def,ad:at/df};
  }).sort((a,b)=>b.elo-a.elo),[teams,elos,lg,allTeams]);
  const cbRSort=useSortable(ranks,'elo','desc');
  const cbMCSort=useSortable(rMC?rMC.probs:[],'ch','desc');
  const[qR,setQR]=useState('');const[qM,setQM]=useState('');
  const cbRFiltered=useMemo(()=>filterByName(cbRSort.sorted,qR),[cbRSort.sorted,qR]);
  const cbMCFiltered=useMemo(()=>filterByName(cbMCSort.sorted,qM),[cbMCSort.sorted,qM]);

  // Simular confronto 2 jogos ida/volta
  const sim2L=(a,b,at,df,el)=>{const{mc,mf}=getML(cfg,'CB');
    const l1=calcL(at[a],df[a],at[b],df[b],el[a],el[b],mc,mf,cfg.homeAdv,eo,cfg.c0Log);const g1a=poissonRandom(l1.lC),g1b=poissonRandom(l1.lF);
    const l2=calcL(at[b],df[b],at[a],df[a],el[b],el[a],mc,mf,cfg.homeAdv,eo,cfg.c0Log);const g2b=poissonRandom(l2.lC),g2a=poissonRandom(l2.lF);
    const aa=g1a+g2a,ab=g1b+g2b;return{a,b,g1a,g1b,g2a,g2b,aa,ab,w:aa>ab?a:ab>aa?b:Math.random()<0.5?a:b,pen:aa===ab};};
  // Final neutro (jogo único)
  const simFin=(a,b,at,df,el)=>{const mn=cfg.mnMM;
    const{lC,lF}=eo?(()=>{const d=el[a]-el[b];const e=1/(1+Math.pow(10,-d/400));return{lC:mn*(0.5+e),lF:mn*(0.5+(1-e))};})():{lC:Math.max(0.2,mn*at[a]*df[b]),lF:Math.max(0.2,mn*at[b]*df[a])};
    const ga=poissonRandom(lC),gb=poissonRandom(lF);return{a,b,ga,gb,w:ga>gb?a:gb>ga?b:Math.random()<0.5?a:b,pen:ga===gb};};

  const runBracket=(at,df,el,useCbScores)=>{
    const r32=CB_R32.map(([ia,ib],idx)=>{
      const a=teams[ia],b=teams[ib];
      if(useCbScores){const sc=cbScores[idx];if(sc&&sc.g1a!==null&&sc.g1b!==null&&sc.g2a!==null&&sc.g2b!==null){const aa=sc.g1a+sc.g2a,ab=sc.g1b+sc.g2b;return{a,b,g1a:sc.g1a,g1b:sc.g1b,g2a:sc.g2a,g2b:sc.g2b,aa,ab,w:aa>ab?a:ab>aa?b:(CB_R16_SET.has(a)?a:CB_R16_SET.has(b)?b:(Math.random()<0.5?a:b)),pen:aa===ab};}}
      return sim2L(a,b,at,df,el);
    });
    const winners=r32.map(m=>m.w);
    const allReal=winners.length===16&&winners.every(w=>CB_R16_SET.has(w));
    let r16p=[];
    if(allReal){r16p=CB_R16_PAIRS.map(([a,b],idx)=>{const sc=cb16Scores[idx];if(useCbScores&&sc&&sc.g1a!=null&&sc.g1b!=null&&sc.g2a!=null&&sc.g2b!=null){const aa=sc.g1a+sc.g2a,ab=sc.g1b+sc.g2b;return{a,b,g1a:sc.g1a,g1b:sc.g1b,g2a:sc.g2a,g2b:sc.g2b,aa,ab,w:aa>ab?a:ab>aa?b:(Math.random()<0.5?a:b),pen:aa===ab};}return sim2L(a,b,at,df,el);});} // oitavas: chaveamento real + placares reais quando houver
    else{const sh16=shuffle(winners);for(let i=0;i<sh16.length;i+=2)r16p.push(sim2L(sh16[i],sh16[i+1],at,df,el));}
    const sh8=shuffle(r16p.map(m=>m.w));const qfp=[];for(let i=0;i<sh8.length;i+=2)qfp.push(sim2L(sh8[i],sh8[i+1],at,df,el));
    const sh4=shuffle(qfp.map(m=>m.w));const sfp=[sim2L(sh4[0],sh4[1],at,df,el),sim2L(sh4[2],sh4[3],at,df,el)];
    const fin=simFin(sfp[0].w,sfp[1].w,at,df,el);
    return{r32,r16:r16p,qf:qfp,sf:sfp,fin,ch:fin.w};
  };

  const doMC=useCallback(()=>{setBusy(true);setTimeout(()=>{const ct={};teams.forEach(t=>ct[t]={r16:0,qf:0,sf:0,fin:0,ch:0});
    for(let sim=0;sim<nS;sim++){const at={},df={},el={};teams.forEach(t=>{el[t]=elos[t];const tt=allTeams&&allTeams[t];if(tt){at[t]=tt.atk;df[t]=tt.def;}else{const i=lg.initAD(elos[t]);at[t]=i.atk;df[t]=i.def;}});
      const br=runBracket(at,df,el,true);br.r32.forEach(j=>{ct[j.w].r16++;});br.r16.forEach(j=>ct[j.w].qf++);br.qf.forEach(j=>ct[j.w].sf++);br.sf.forEach(j=>ct[j.w].fin++);ct[br.ch].ch++;}
    setRMC({probs:teams.map(t=>({time:t,elo:elos[t],r16:ct[t].r16/nS*100,qf:ct[t].qf/nS*100,sf:ct[t].sf/nS*100,fin:ct[t].fin/nS*100,ch:ct[t].ch/nS*100})).sort((a,b)=>b.ch-a.ch||b.elo-a.elo),nSims:nS});setBusy(false);},100);},[nS,elos,cfg,eo,ak,lg,teams,cbScores,allTeams]);

  const doSU=useCallback(()=>{const at={},df={},el={};teams.forEach(t=>{el[t]=elos[t];const tt=allTeams&&allTeams[t];if(tt){at[t]=tt.atk;df[t]=tt.def;}else{const i=lg.initAD(elos[t]);at[t]=i.atk;df[t]=i.def;}});setRSU(runBracket(at,df,el,true));setAba('simU');},[elos,cfg,eo,ak,lg,teams,cbScores,allTeams]);

  const MatchRow=({m,twoLeg})=>(<div className="flex items-center text-xs bg-slate-700/30 rounded p-1.5 mb-0.5">
    <span className={`flex-1 text-right pr-1 truncate ${m.w===m.a?'text-emerald-300 font-bold':'text-slate-400'}`}><TN name={m.a}/></span>
    {twoLeg?<span className="font-mono w-28 text-center text-[10px]">{m.g1a}-{m.g1b} / {m.g2a}-{m.g2b} ({m.aa}×{m.ab}{m.pen?' pen':''})</span>
      :<span className="font-mono w-14 text-center">{m.ga}×{m.gb}{m.pen?' pen':''}</span>}
    <span className={`flex-1 pl-1 truncate ${m.w===m.b?'text-emerald-300 font-bold':'text-slate-400'}`}><TN name={m.b}/></span></div>);

  return(<div>
    <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
      <span className="text-[10px] text-slate-500 italic mr-2">Para Monte Carlo, use "Simular Tudo" no dashboard acima.</span>
      <button onClick={doSU} className="px-4 py-1.5 bg-slate-700 rounded-lg text-xs border border-slate-600 hover:bg-slate-600 transition-colors">1 Sim rápido</button>
    </div>
    <div className="flex gap-1 mb-3 bg-slate-800/40 rounded-xl p-1">{[{id:'ratings',l:'Ratings'},{id:'jogos',l:'R16'},{id:'bracket',l:'Formato'},{id:'mc',l:'Monte Carlo'},{id:'chaves',l:'Chaves'},{id:'simU',l:'1 Sim'}].map(t=>(<button key={t.id} onClick={()=>setAba(t.id)} className={`flex-1 py-1.5 px-1 rounded-lg text-xs font-medium ${aba===t.id?'bg-emerald-600/80 text-white shadow':'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>{t.l}</button>))}</div>

    {aba==='ratings'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50"><h2 className="text-base font-semibold text-emerald-300 mb-1">32 Times — estado atual (spread={lg.spread.toFixed(2)})</h2><p className="text-xs text-slate-500 mb-2">Elo, atk, def evoluídos por todos os resultados reais (Séries A/B/C/D + Copa BR ida). <span className="italic">Clique nos cabeçalhos para ordenar</span></p>
    <TableToolbar query={qR} setQuery={setQR} showing={cbRFiltered.length} total={cbRSort.sorted.length}
      onExport={()=>exportCSV(cbRFiltered,[{label:'Time',key:'time'},{label:'ELO ini',key:'eloIni'},{label:'ELO',key:'elo'},{label:'ΔELO',key:'dE'},{label:'ATK ini',key:'atkIni'},{label:'ATK',key:'atk'},{label:'ΔATK',key:'dA'},{label:'DEF ini',key:'defIni'},{label:'DEF',key:'def'},{label:'ΔDEF',key:'dD'},{label:'A/D',key:'ad'}],'ratings_CB.csv')}/>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-700 text-xs">
      <th className="text-left py-2 w-8 text-slate-500">#</th>
      <SortHeader k="time" label="Time" sort={cbRSort.sort} onClick={cbRSort.toggle} className="py-2"/>
      <SortHeader k="eloIni" label="ELO ini" sort={cbRSort.sort} onClick={cbRSort.toggle} align="right" className="py-2"/>
      <SortHeader k="elo" label="ELO" sort={cbRSort.sort} onClick={cbRSort.toggle} align="right" className="py-2"/>
      <SortHeader k="dE" label="ΔELO" sort={cbRSort.sort} onClick={cbRSort.toggle} align="right" className="py-2"/>
      <SortHeader k="atkIni" label="ATK ini" sort={cbRSort.sort} onClick={cbRSort.toggle} align="right" className="py-2"/>
      <SortHeader k="atk" label="ATK" sort={cbRSort.sort} onClick={cbRSort.toggle} align="right" className="py-2"/>
      <SortHeader k="dA" label="ΔATK" sort={cbRSort.sort} onClick={cbRSort.toggle} align="right" className="py-2"/>
      <SortHeader k="defIni" label="DEF ini" sort={cbRSort.sort} onClick={cbRSort.toggle} align="right" className="py-2"/>
      <SortHeader k="def" label="DEF" sort={cbRSort.sort} onClick={cbRSort.toggle} align="right" className="py-2"/>
      <SortHeader k="dD" label="ΔDEF" sort={cbRSort.sort} onClick={cbRSort.toggle} align="right" className="py-2"/>
      <SortHeader k="ad" label="A/D" sort={cbRSort.sort} onClick={cbRSort.toggle} align="right" className="py-2"/>
    </tr></thead><tbody>{(()=>{const rowOf=(r,i)=>{
      const sgn=(v,fmt=2)=>(v>=0?'+':'')+v.toFixed(fmt);
      return(<tr key={r.time} className="border-b border-slate-700/20 hover:bg-slate-700/30 transition-colors">
        <td className="py-1 pl-2 text-slate-500 font-bold">{i+1}</td>
        <td className="py-1 font-medium"><TN name={r.time}/></td>
        <td className="text-right font-mono text-slate-400">{r.eloIni}</td>
        <td className="text-right font-mono font-bold">{r.elo}</td>
        <td className={`text-right font-mono ${r.dE>5?'text-emerald-400':r.dE<-5?'text-red-400':'text-slate-500'}`}>{sgn(r.dE,0)}</td>
        <td className="text-right font-mono text-slate-400 border-l border-slate-700/50">{r.atkIni.toFixed(2)}</td>
        <td className={`text-right font-mono ${r.atk>1.05?'text-green-400':'text-slate-300'}`}>{r.atk.toFixed(2)}</td>
        <td className={`text-right font-mono ${r.dA>0.03?'text-emerald-400':r.dA<-0.03?'text-red-400':'text-slate-500'}`}>{sgn(r.dA,3)}</td>
        <td className="text-right font-mono text-slate-400 border-l border-slate-700/50">{r.defIni.toFixed(2)}</td>
        <td className={`text-right font-mono ${r.def<0.95?'text-green-400':'text-slate-300'}`}>{r.def.toFixed(2)}</td>
        <td className={`text-right font-mono ${r.dD>0.03?'text-red-400':r.dD<-0.03?'text-emerald-400':'text-slate-500'}`}>{sgn(r.dD,3)}</td>
        <td className="text-right font-mono font-bold text-slate-300">{r.ad.toFixed(2)}</td>
      </tr>);
    };const cls=cbRFiltered.filter(r=>CB_R16_SET.has(r.time)),eli=cbRFiltered.filter(r=>!CB_R16_SET.has(r.time));const rows=[];cls.forEach((r,i)=>rows.push(rowOf(r,i)));if(eli.length)rows.push(<tr key="sep" className="bg-slate-900/60"><td colSpan={12} className="py-1 px-2 text-[10px] font-bold text-amber-400 uppercase tracking-wider">Eliminados na R32</td></tr>);eli.forEach((r,i)=>rows.push(rowOf(r,cls.length+i)));return rows;})()}</tbody></table></div></div>}

    {aba==='jogos'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50"><h2 className="text-base font-semibold text-emerald-300 mb-3">Oitavas (R16) — Sorteio definido</h2>
      <p className="text-[10px] text-slate-500 mb-2">Insira os placares (ida + volta) das oitavas para fixar resultados na simulação. A R32 já está consolidada nos ratings.</p>
      <div className="space-y-1">{CB_R16_PAIRS.map(([a,b],idx)=>{const sc=cb16Scores[idx]||{};const done=sc.g1a!=null&&sc.g1b!=null&&sc.g2a!=null&&sc.g2b!=null;
        const upd=(k,v)=>{setCb16Scores(prev=>({...prev,[idx]:{...prev[idx],[k]:v===''?null:Math.max(0,parseInt(v)||0)}}));setRMC(null);setRSU(null);};
        const SInput=({k})=>(<input type="number" min="0" max="20" value={sc[k]===null||sc[k]===undefined?'':sc[k]} onChange={e=>upd(k,e.target.value)}
          className="w-6 h-5 bg-slate-600 text-center text-[10px] rounded border border-slate-500 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"/>);
        const aa=(sc.g1a||0)+(sc.g2a||0),ab2=(sc.g1b||0)+(sc.g2b||0);
        return(<div key={idx} className={`p-1.5 rounded text-xs ${done?'bg-emerald-900/20 border-l-2 border-emerald-500':'bg-slate-700/30'}`}>
          <div className="flex items-center gap-1">
            <span className="text-slate-500 w-4 font-mono text-[10px]">{idx+1}</span>
            <span className="flex-1 text-right truncate pr-1 font-medium text-[11px]"><TN name={a}/></span>
            <span className="text-[9px] text-slate-500">ida</span><SInput k="g1a"/><span className="text-slate-600">x</span><SInput k="g1b"/>
            <span className="text-[9px] text-slate-500 ml-1">vta</span><SInput k="g2b"/><span className="text-slate-600">x</span><SInput k="g2a"/>
            <span className="flex-1 truncate pl-1 font-medium text-[11px]"><TN name={b}/></span>
            {done&&<span className={`text-[10px] font-bold ml-1 ${aa>ab2?'text-blue-400':ab2>aa?'text-orange-400':'text-yellow-400'}`}>{aa}×{ab2}{aa===ab2?' pen':''}</span>}
            {done&&<button onClick={()=>{setCb16Scores(prev=>{const n={...prev};delete n[idx];return n;});setRMC(null);setRSU(null);}} className="text-red-400 text-[10px] ml-1">✕</button>}
          </div>
        </div>);})}</div>
      {Object.keys(cb16Scores).length>0&&<div className="mt-2 flex justify-between"><span className="text-xs text-amber-400">{Object.values(cb16Scores).filter(s=>s.g1a!=null&&s.g1b!=null&&s.g2a!=null&&s.g2b!=null).length} de 8 jogos definidos</span><button onClick={()=>{setCb16Scores({});setRMC(null);setRSU(null);}} className="text-xs text-red-400">Limpar</button></div>}
      <p className="text-xs text-slate-500 mt-2">ida: mandante = time da esquerda | volta: mandante = time da direita</p></div>}

    {aba==='bracket'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50"><h2 className="text-base font-semibold text-emerald-300 mb-3">Formato Copa do Brasil 2026</h2>
      <div className="text-xs text-slate-400 space-y-2 bg-slate-900/50 rounded-lg p-3">
        <p><span className="text-emerald-300 font-bold">R32 (32→16):</span> Chave definida pela CBF (seed 1×32, 2×31, etc). Ida e volta. Empate no agregado = pênaltis.</p>
        <p><span className="text-emerald-300 font-bold">R16 (16→8): SORTEIO JÁ REALIZADO</span> — chaveamento fixo (Flu×Vasco, Inter×Corinthians, Mirassol×Grêmio, Athletico-PR×Vitória, Atlético-MG×Juventude, Santos×Remo, Chapecoense×Cruzeiro, Palmeiras×Fortaleza). Ida e volta.</p>
        <p><span className="text-amber-300 font-bold">Quartas em diante: SORTEIO</span> a cada fase — os classificados são pareados aleatoriamente em cada simulação.</p>
        <p><span className="text-emerald-300 font-bold">Quartas (8→4):</span> Sorteio. Ida e volta.</p>
        <p><span className="text-emerald-300 font-bold">Semifinal (4→2):</span> Sorteio. Ida e volta.</p>
        <p><span className="text-emerald-300 font-bold">Final:</span> Jogo único em campo neutro (λ = MN_MM = {cfg.mnMM}). Empate = pênaltis.</p>
        <p className="text-amber-300 mt-2 font-medium">A R16 é fixa (sorteio já realizado); das quartas em diante cada simulação faz um sorteio independente.</p>
      </div></div>}

    {aba==='mc'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">{!rMC?<p className="text-slate-400 text-center py-8">Rode "⚡ Simular Tudo" no dashboard acima para ver os resultados Monte Carlo.</p>:<div><h2 className="text-base font-semibold text-emerald-300 mb-3">{rMC.nSims.toLocaleString()} sims <span className="text-slate-500 text-xs italic">· clique cabeçalhos para ordenar</span></h2>
    {rMC.probs.some(p=>p.evolved)&&<div className="mb-3 p-2 bg-blue-950/40 border border-blue-800/40 rounded-lg text-[11px] text-blue-300">
      <span className="font-semibold">ℹ️ Ratings evoluídos:</span> Elos e atk/def dos times nas Séries A/B/C/D vêm das simulações MC dessas séries (reflete rodadas reais + drift). Times sem simulação da sua série de origem usam o rating nominal.
    </div>}
    {(CB_RES_IDA.length>0||CB_RES_VOLTA.length>0)&&<div className="mb-3 p-2 bg-emerald-950/40 border border-emerald-800/40 rounded-lg text-[11px] text-emerald-300">
      <span className="font-semibold">✅ Resultados reais aplicados:</span> {CB_RES_IDA.length} jogo(s) de ida {CB_RES_VOLTA.length>0?`e ${CB_RES_VOLTA.length} de volta`:''} da R32 incorporados. Para pares com ida confirmada, apenas a volta é simulada (mando inverte). Empate agregado → 50/50 (pênaltis).
    </div>}
    <TableToolbar query={qM} setQuery={setQM} showing={cbMCFiltered.length} total={cbMCSort.sorted.length}
      onExport={()=>exportCSV(cbMCFiltered,[{label:'Time',key:'time'},{label:'ELO atual',key:'elo'},{label:'R16%',key:'r16'},{label:'QF%',key:'qf'},{label:'SF%',key:'sf'},{label:'Final%',key:'fin'},{label:'Titulo%',key:'ch'}],'mc_CB.csv')}/>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-700 text-xs">
      <th className="text-left py-2 w-8 text-slate-500">#</th>
      <SortHeader k="time" label="Time" sort={cbMCSort.sort} onClick={cbMCSort.toggle} className="py-2"/>
      <SortHeader k="elo" label="ELO atual" sort={cbMCSort.sort} onClick={cbMCSort.toggle} align="right" className="py-2"/>
      <SortHeader k="r16" label="R16" sort={cbMCSort.sort} onClick={cbMCSort.toggle} align="center" className="py-2"/>
      <SortHeader k="qf" label="QF" sort={cbMCSort.sort} onClick={cbMCSort.toggle} align="center" className="py-2"/>
      <SortHeader k="sf" label="SF" sort={cbMCSort.sort} onClick={cbMCSort.toggle} align="center" className="py-2"/>
      <SortHeader k="fin" label="Final" sort={cbMCSort.sort} onClick={cbMCSort.toggle} align="center" className="py-2"/>
      <SortHeader k="ch" label="Título" sort={cbMCSort.sort} onClick={cbMCSort.toggle} align="center" className="py-2"/>
    </tr></thead><tbody>{cbMCFiltered.map((p,i)=>(<tr key={p.time} className="border-b border-slate-700/30 hover:bg-slate-700/30 transition-colors"><td className="py-1 pl-2 text-slate-500 font-bold">{i+1}</td><td className="py-1 font-medium"><TN name={p.time}/></td><td className="text-right font-mono text-emerald-300">{p.elo}</td><td className="text-center text-xs">{Math.round(p.r16)}%</td><td className="text-center text-xs">{Math.round(p.qf)}%</td><td className="text-center text-xs">{Math.round(p.sf)}%</td><td className="text-center text-xs">{Math.round(p.fin)}%</td><td className="text-center"><div className="flex items-center gap-1"><div className="flex-1 h-3 bg-slate-700 rounded-full overflow-hidden"><div className="h-full bg-yellow-500 rounded-full transition-all" style={{width:`${Math.max(1,p.ch)}%`}}></div></div><span className="text-xs w-10 text-right">{p.ch<1&&p.ch>0?'<1':Math.round(p.ch)}%</span></div></td></tr>))}</tbody></table></div></div>}</div>}

    {aba==='chaves'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">{!rMC?<p className="text-slate-400 text-center py-8">Rode "⚡ Simular Tudo" no dashboard acima para ver os cruzamentos.</p>:<div>
      <h2 className="text-base font-semibold text-emerald-300 mb-3">Cruzamentos mais prováveis <span className="text-slate-500 text-xs italic">· {rMC.nSims.toLocaleString()} sims</span></h2>
      <MatchupsView
        probs={rMC.probs}
        phases={[
          {key:'r32',label:'R32',probKey:null},
          {key:'r16',label:'R16',probKey:'r16'},
          {key:'qf',label:'Quartas',probKey:'qf'},
          {key:'sf',label:'Semi',probKey:'sf'},
          {key:'fin',label:'Final',probKey:'fin'}
        ]}
        sortKey="ch"
      />
    </div>}</div>}

    {aba==='simU'&&<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">{!rSU?<p className="text-slate-400 text-center py-8">Clique 1 Sim</p>:<div>
      <div className="mb-3 p-3 bg-emerald-900/30 rounded-xl border border-emerald-600/30 text-center"><span className="text-2xl">🏆</span> <span className="text-emerald-300 font-bold text-lg"><TN name={rSU.ch}/></span></div>
      <h3 className="text-sm font-semibold text-slate-300 mb-2">R32 — Ida e Volta ({CB_DATES[0]})</h3>{rSU.r32.map((m,i)=><MatchRow key={i} m={m} twoLeg/>)}
      <h3 className="text-sm font-semibold text-slate-300 mt-3 mb-2">R16 ({CB_DATES[1]})</h3>{rSU.r16.map((m,i)=><MatchRow key={i} m={m} twoLeg/>)}
      <h3 className="text-sm font-semibold text-slate-300 mt-3 mb-2">Quartas ({CB_DATES[2]})</h3>{rSU.qf.map((m,i)=><MatchRow key={i} m={m} twoLeg/>)}
      <h3 className="text-sm font-semibold text-slate-300 mt-3 mb-2">Semi ({CB_DATES[3]})</h3>{rSU.sf.map((m,i)=><MatchRow key={i} m={m} twoLeg/>)}
      <h3 className="text-sm font-semibold text-slate-300 mt-3 mb-2">Final ({CB_DATES[4]}) — Jogo Único Neutro</h3><MatchRow m={rSU.fin}/>
    </div>}</div>}
  </div>);
}

// ============================================================================
// AO VIVO (filtro por série)
// ============================================================================
function LiveSim({cfg,allTeams}){
  const[sC,setSC]=useState('A');const[sF,setSF]=useState('A');const[nC,setNC]=useState('Flamengo');const[nF,setNF]=useState('Palmeiras');
  const[gC,setGC]=useState(0);const[gF,setGF]=useState(0);const[min,setMin]=useState(0);
  const bS=useMemo(()=>{const m={};Object.entries(allTeams).forEach(([n,d])=>{if(!m[d.serie])m[d.serie]=[];m[d.serie].push(n);});Object.values(m).forEach(a=>a.sort());return m;},[allTeams]);
  // Ratings por série (mesma base do pré-jogo) quando os dois times são da mesma série;
  // senão, estado unificado (allTeams) para confrontos entre séries.
  const sameSerie=sC===sF;
  const perSerie=useMemo(()=>sameSerie?computeCurrentAD(H2H_SERIES[sC].times,H2H_SERIES[sC].getElo,H2H_SERIES[sC].res,cfg,sC,cfg.defaultAlpha,false):null,[sameSerie,sC,cfg]);
  const res=useMemo(()=>{const{mc:MC,mf:MF}=getML(cfg,sC);const n0=3,TOT=100;let lc90,lf90;
    if(perSerie&&perSerie.elo[nC]!=null&&perSerie.elo[nF]!=null){const r=calcL(perSerie.atk[nC],perSerie.def[nC],perSerie.atk[nF],perSerie.def[nF],perSerie.elo[nC],perSerie.elo[nF],MC,MF,cfg.homeAdv,false,cfg.c0Log);lc90=r.lC;lf90=r.lF;}
    else{const tc=allTeams[nC]||{atk:1,def:1,elo:1500};const tf=allTeams[nF]||{atk:1,def:1,elo:1500};const r=calcL(tc.atk,tc.def,tf.atk,tf.def,tc.elo||1500,tf.elo||1500,MC,MF,cfg.homeAdv,false,cfg.c0Log);lc90=r.lC;lf90=r.lF;}
    const fr=Math.min(min,TOT)/TOT,rest=1-fr;
    if(fr<=0&&gC===0&&gF===0){const{pH,pD,pA}=calcProbs(lc90,lf90);return{pC:pH/100,pE:pD/100,pF:pA/100,lcR:lc90,lfR:lf90};}
    const lcP=(n0*lc90+gC)/(n0+fr),lfP=(n0*lf90+gF)/(n0+fr);const lcR=Math.max(0.01,lcP*rest),lfR=Math.max(0.01,lfP*rest);
    let pC=0,pE=0,pF=0;for(let s=0;s<10000;s++){const gc=gC+poissonRandom(lcR),gf=gF+poissonRandom(lfR);if(gc>gf)pC++;else if(gc===gf)pE++;else pF++;}
    return{pC:pC/10000,pE:pE/10000,pF:pF/10000,lcR,lfR};},[nC,nF,sC,gC,gF,min,allTeams,perSerie,cfg]);
  return(<div className="space-y-4">
    <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50"><div className="grid grid-cols-2 gap-4">
      <div><label className="text-xs text-blue-400 mb-1 block">Mandante</label><select value={sC} onChange={e=>{setSC(e.target.value);setNC((bS[e.target.value]||[])[0]||'');}} className="w-full bg-slate-700 text-white text-xs rounded-lg px-2 py-1 mb-1 border border-slate-600">{['A','B','C','D'].map(s=><option key={s} value={s}>Série {s}</option>)}</select><select value={nC} onChange={e=>setNC(e.target.value)} className="w-full bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-blue-500/50">{(bS[sC]||[]).map(t=><option key={t} value={t}>{t}</option>)}</select></div>
      <div><label className="text-xs text-orange-400 mb-1 block">Visitante</label><select value={sF} onChange={e=>{setSF(e.target.value);setNF((bS[e.target.value]||[])[0]||'');}} className="w-full bg-slate-700 text-white text-xs rounded-lg px-2 py-1 mb-1 border border-slate-600">{['A','B','C','D'].map(s=><option key={s} value={s}>Série {s}</option>)}</select><select value={nF} onChange={e=>setNF(e.target.value)} className="w-full bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-orange-500/50">{(bS[sF]||[]).map(t=><option key={t} value={t}>{t}</option>)}</select></div>
    </div></div>
    <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
      <div className="flex items-center justify-center gap-4 mb-4"><div className="text-center"><div className="text-xs text-blue-400 mb-1">{nC}</div><div className="flex items-center gap-2"><button onClick={()=>setGC(Math.max(0,gC-1))} className="w-8 h-8 bg-slate-700 rounded-lg text-lg">−</button><span className="text-3xl font-bold w-10 text-center">{gC}</span><button onClick={()=>setGC(gC+1)} className="w-8 h-8 bg-slate-700 rounded-lg text-lg">+</button></div></div><span className="text-2xl text-slate-500">×</span><div className="text-center"><div className="text-xs text-orange-400 mb-1">{nF}</div><div className="flex items-center gap-2"><button onClick={()=>setGF(Math.max(0,gF-1))} className="w-8 h-8 bg-slate-700 rounded-lg text-lg">−</button><span className="text-3xl font-bold w-10 text-center">{gF}</span><button onClick={()=>setGF(gF+1)} className="w-8 h-8 bg-slate-700 rounded-lg text-lg">+</button></div></div></div>
      <div className="flex items-center gap-2"><span className="text-xs text-slate-400 w-8">Min:</span><input type="range" min={0} max={100} value={min} onChange={e=>setMin(Number(e.target.value))} className="flex-1 h-2 bg-slate-700 rounded-lg accent-emerald-500"/><span className="text-xs text-emerald-300 w-8 text-right font-mono">{min}'</span></div>
    </div>
    <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
      <div className="flex h-8 rounded-full overflow-hidden mb-2"><div className="bg-blue-600 flex items-center justify-center text-xs font-bold" style={{width:`${res.pC*100}%`}}>{(res.pC*100).toFixed(1)}%</div><div className="bg-slate-500 flex items-center justify-center text-xs font-bold" style={{width:`${res.pE*100}%`}}>{(res.pE*100).toFixed(1)}%</div><div className="bg-orange-600 flex items-center justify-center text-xs font-bold" style={{width:`${res.pF*100}%`}}>{(res.pF*100).toFixed(1)}%</div></div>
      <div className="flex justify-between text-xs text-slate-400"><span className="text-blue-400">{nC}</span><span>Empate</span><span className="text-orange-400">{nF}</span></div>
    </div>
  </div>);
}

// ============================================================================
// BUSCA DE RESULTADOS VIA CLAUDE + WEB SEARCH
// ============================================================================
function SearchPanel({onResults}) {
  const[busy,setBusy]=useState(false);const[found,setFound]=useState(null);const[err,setErr]=useState('');
  const[apiKey,setApiKey]=useState('');const[showKey,setShowKey]=useState(false);

  // Pre-fill: compute which series had games yesterday
  const hoje=new Date();const ontem=new Date(hoje);ontem.setDate(ontem.getDate()-1);
  const ddmm=(d)=>(d.getDate()<10?'0':'')+d.getDate()+'/'+(d.getMonth()<9?'0':'')+(d.getMonth()+1);
  const dm=ddmm(ontem);
  const series=[];
  if(SA_DATES.includes(dm))series.push('A');
  if(SB_DATES.includes(dm))series.push('B');
  if(SC_DATES.includes(dm))series.push('C');
  const defaultQ=series.length>0
    ?'Resultados Brasileirão Série '+series.join(', ')+' de '+ontem.toLocaleDateString('pt-BR')
    :'Resultados Brasileirão '+ontem.toLocaleDateString('pt-BR');
  const[query,setQuery]=useState(defaultQ);

  const buscar=async()=>{
    const q=query||defaultQ;setBusy(true);setErr('');setFound(null);
    const prompt='Busque na web os resultados FINAIS (com placar) do '+q+'. Procure em sites como ge.globo.com, espn.com.br, uol.com.br. Para cada jogo finalizado informe a série (A, B ou C), a rodada, o time mandante, gols do mandante, gols do visitante e time visitante.\n\nRetorne SOMENTE um array JSON, nada mais:\n[{"serie":"A","rodada":10,"casa":"Flamengo","gc":2,"gf":1,"fora":"Santos"}]\nVazio se nada: []\nNomes oficiais: Atlético-MG, São Paulo, Red Bull Bragantino, Athletico-PR, Operário-PR, Criciúma, Novorizontino, Goiás, Avaí, etc.';
    const body={model:'claude-sonnet-4-20250514',max_tokens:3000,tools:[{type:'web_search_20250305',name:'web_search'}],messages:[{role:'user',content:prompt}]};
    const headers={'Content-Type':'application/json'};
    if(apiKey)headers['x-api-key']=apiKey;
    try{
      const resp=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers,body:JSON.stringify(body)});
      if(!resp.ok){
        const errBody=await resp.text().catch(()=>'');
        if(resp.status===401||resp.status===403){setShowKey(true);setErr('API key necessária');setBusy(false);return;}
        setErr('Erro '+resp.status+': '+(errBody.slice(0,100)));setBusy(false);return;
      }
      const data=await resp.json();
      // Extract text from all content blocks (skip tool_use/web_search blocks)
      let text='';
      for(const block of (data.content||[])){
        if(block.type==='text')text+=block.text;
      }
      text=text.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim();
      let results=[];
      // Try parsing the full text as JSON
      try{results=JSON.parse(text);}catch(e){
        // Try finding JSON array in text
        const m=text.match(/\[[\s\S]*?\]/);
        if(m)try{results=JSON.parse(m[0]);}catch(e2){}
      }
      if(!Array.isArray(results))results=[];
      if(results.length===0&&text.length>0){setErr('Nenhum resultado parseado. Resposta: '+text.slice(0,150));}
      else{setFound(results);}
    }catch(e){setErr('Erro de rede: '+e.message);}
    setBusy(false);
  };

  const[applied,setApplied]=useState(false);
  const aplicar=()=>{if(found&&found.length>0){onResults(found);setApplied(true);setTimeout(()=>{setFound(null);setApplied(false);},2000);}};

  return(<div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-700/50">
    <h3 className="text-sm font-bold text-emerald-300 mb-2">🔍 Buscar Resultados</h3>
    <div className="flex gap-2 mb-2">
      <input value={query} onChange={e=>setQuery(e.target.value)}
        className="flex-1 bg-slate-700 text-white text-xs rounded-lg px-3 py-2 border border-slate-600" onKeyDown={e=>{if(e.key==='Enter')buscar();}}/>
      <button onClick={buscar} disabled={busy} className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-lg font-semibold text-xs disabled:opacity-50 whitespace-nowrap">{busy?'Buscando...':'Buscar'}</button>
    </div>
    {showKey&&<div className="flex gap-2 mb-2"><input value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder="sk-ant-..." type="password"
      className="flex-1 bg-slate-700 text-white text-xs rounded-lg px-3 py-2 border border-amber-600/50"/><button onClick={buscar} disabled={busy} className="px-3 py-2 bg-amber-600 rounded-lg text-xs font-bold">OK</button></div>}
    {err&&<p className="text-xs text-red-400 mb-2">{err}</p>}
    {found&&found.length>0&&<div>
      <p className="text-xs text-emerald-400 mb-2">{found.length} resultado(s) encontrado(s):</p>
      <div className="space-y-0.5 mb-2">{found.map((r,i)=>(<div key={i} className="flex items-center justify-between p-1.5 rounded text-xs bg-emerald-900/20 border-l-2 border-emerald-500">
        <span className="text-slate-400 w-10 text-[10px]">S{r.serie} R{r.rodada}</span>
        <span className="flex-1 text-right truncate pr-1 font-medium">{r.casa}</span>
        <span className="font-mono font-bold w-12 text-center text-emerald-300">{r.gc} x {r.gf}</span>
        <span className="flex-1 truncate pl-1 font-medium">{r.fora}</span>
      </div>))}</div>
      <button onClick={aplicar} disabled={applied} className={`w-full py-2 rounded-lg text-xs font-bold ${applied?'bg-emerald-800 text-emerald-300':'bg-emerald-600 hover:bg-emerald-500'}`}>{applied?'✅ Aplicado!':'✅ Aplicar '+found.length+' resultado(s)'}</button>
    </div>}
    {found&&found.length===0&&<p className="text-xs text-yellow-400">Nenhum resultado encontrado para esta busca.</p>}
  </div>);
}

// ============================================================================
// APP PRINCIPAL
// ============================================================================
// Aba unificada Confronto: pré-jogo (H2H) + ao vivo (placar/minuto), via toggle.
function ConfrontoMerged({cfg,allTeams}){
  const[modo,setModo]=useState('pre');
  return(<div className="space-y-3">
    <div className="flex gap-1 bg-slate-800/40 rounded-xl p-1 max-w-xs">
      {[{id:'pre',l:'Pré-jogo'},{id:'live',l:'Ao vivo'}].map(m=>(<button key={m.id} onClick={()=>setModo(m.id)} className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium ${modo===m.id?'bg-emerald-600/80 text-white shadow':'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>{m.l}</button>))}
    </div>
    {modo==='pre'?<H2HSim cfg={cfg}/>:<LiveSim cfg={cfg} allTeams={allTeams}/>}
  </div>);
}

export default function SimuladorUnificado(){
  const[cfg,setCfg]=useState(DEFAULT_CFG);const[tab,setTab]=useState('serieA');
  // Estado de expansão por card: {A:false,B:false,...}. True = mostra tabela completa.
  const[dashExpanded,setDashExpanded]=useState({A:false,B:false,C:false,D:false,CB:false});
  const toggleExpanded=(k)=>setDashExpanded(prev=>({...prev,[k]:!prev[k]}));
  const[dash,setDash]=useState(null);const[dashBusy,setDashBusy]=useState(false);const[dashN,setDashN]=useState(10000);const[dashAk,setDashAk]=useState(cfg.defaultAlpha);const[dashEo,setDashEo]=useState(false);const[dashDrift,setDashDrift]=useState(15);
  // Checkboxes: quais séries rodar ao clicar "Simular Tudo". Copa BR é a mais pesada.
  const[dashSel,setDashSel]=useState({A:true,B:true,C:true,D:true,CB:true});
  const toggleSel=(k)=>setDashSel(prev=>({...prev,[k]:!prev[k]}));
  const[fetchedRes,setFetchedRes]=useState(()=>{try{const s=localStorage.getItem('simUni_fetchedRes');if(s){const p=JSON.parse(s);return{A:p.A||[],B:p.B||[],C:p.C||[],D:p.D||[]};}}catch(e){}return{A:[],B:[],C:[],D:[]};});
  useEffect(()=>{try{localStorage.setItem('simUni_fetchedRes',JSON.stringify(fetchedRes));}catch(e){}},[fetchedRes]);
  const[showSearch,setShowSearch]=useState(false);
  // Normalizar nomes de times (busca → simulador)
  const normName=(n)=>{const map={'Atletico-MG':'Atlético-MG','Atletico Mineiro':'Atlético-MG','Atletico-GO':'Atlético-GO','Atletico Goianiense':'Atlético-GO','Athletico Paranaense':'Athletico-PR','Athletico PR':'Athletico-PR','RB Bragantino':'Red Bull Bragantino','Bragantino':'Red Bull Bragantino','Sao Paulo':'São Paulo','Sao Bernardo':'São Bernardo','Gremio':'Grêmio','Avai':'Avaí','Cuiaba':'Cuiabá','Goias':'Goiás','America-MG':'América-MG','America Mineiro':'América-MG','Nautico':'Náutico','Criciuma':'Criciúma','Operario-PR':'Operário-PR','Botafogo SP':'Botafogo-SP','Botafogo PB':'Botafogo-PB','Novorizontino':'Novorizontino','Grêmio Novorizontino':'Novorizontino','Vasco da Gama':'Vasco','Atletico-CE':'Atlético-CE'};return map[n]||n;};
  // Inferir rodada pela tabela
  const findRod=(casa,fora,serie)=>{if(serie==='D'){const j=SD_REAL_TAB.find(g=>g.casa===casa&&g.fora===fora);return j?j.rodada:0;}const tab=serie==='A'?SAT:serie==='B'?SBT:serie==='C'?SCT:null;if(!tab)return 0;const j=tab.find(g=>g.casa===casa&&g.fora===fora);return j?j.rodada:0;};
  const handleSearchResults=(results)=>{
    const byS={A:[],B:[],C:[],D:[]};let added=0;
    const builtIn={A:SA_RES,B:SB_RES,C:SC_RES,D:SD_RES};
    const dSet=new Set(SD_TIMES);
    results.forEach(r=>{
      const s=(r.serie||'').toUpperCase();
      if(!byS[s])return;
      let casa=normName(String(r.casa||'').trim());
      let fora=normName(String(r.fora||'').trim());
      const gc=parseInt(r.gc)||0;const gf=parseInt(r.gf)||0;
      let rod=parseInt(r.rodada)||0;
      if(!casa||!fora)return;
      if(s==='D'&&(!dSet.has(casa)||!dSet.has(fora)))return; // nomes da D precisam ser canônicos
      if(builtIn[s].some(e=>e.c===casa&&e.f===fora))return; // já está nos resultados embutidos
      if(!rod)rod=findRod(casa,fora,s);
      byS[s].push({c:casa,f:fora,gc,gf,r:rod});added++;
    });
    if(added>0){
      setFetchedRes(prev=>{
        const dedup=(arr,add)=>{const out=[...arr];add.forEach(n=>{if(!out.some(e=>e.c===n.c&&e.f===n.f))out.push(n);});return out;};
        return{A:dedup(prev.A,byS.A),B:dedup(prev.B,byS.B),C:dedup(prev.C,byS.C),D:dedup(prev.D||[],byS.D)};
      });
    }
  };
  const SAT=useMemo(()=>parseTab(SA_TAB,SA_NM,SA_DATES),[]);const SBT=useMemo(()=>parseTab(SB_TAB,SB_NM,SB_DATES),[]);const SCT=useMemo(()=>parseTab(SC_TAB,SC_NM,SC_DATES),[]);
  const fixtureCheck=useMemo(()=>fixtureIntegrity(SAT,SBT,SCT),[SAT,SBT,SCT]);
  const dataHealth=useMemo(()=>dataHealthReport(SAT,SBT,SCT),[SAT,SBT,SCT]);
  // allTeams/allElos: estado UNIFICADO (Elo/atk/def evoluídos por todos os resultados
  // reais aplicados de A/B/C/D + CB ida/volta). Substitui o snapshot nominal pré-temporada
  // anterior. Agora a aba "Ratings" da Copa BR mostra valores atuais (Palmeiras 1763,
  // Bahia 1545 pós CB, etc.) e LiveSim/CopaBrasilSim trabalham com estado real.
  const allTeams=useMemo(()=>{const db={};const u=computeUnifiedState(cfg,cfg.defaultAlpha||'base');
    Object.keys(SA_RANKING).forEach(t=>{db[t]={atk:u.atk[t],def:u.def[t],elo:u.elos[t],serie:'A'};});
    Object.keys(SB_RANKING).forEach(t=>{db[t]={atk:u.atk[t],def:u.def[t],elo:u.elos[t],serie:'B'};});
    Object.keys(SC_RANKING).forEach(t=>{db[t]={atk:u.atk[t],def:u.def[t],elo:u.elos[t],serie:'C'};});
    SD_TIMES.forEach(t=>{db[t]={atk:u.atk[t],def:u.def[t],elo:u.elos[t],serie:'D'};});
    return db;},[cfg]);
  const allElos=useMemo(()=>{const e={};Object.entries(allTeams).forEach(([n,d])=>e[n]=d.elo);return e;},[allTeams]);

  const[dashProgress,setDashProgress]=useState(0);
  const[dashStage,setDashStage]=useState('');
  const runAll=useCallback(()=>{
    setDashBusy(true);setDashProgress(0);setDashStage('');
    // Derive cfg with dashboard drift override — preserva cfg base, só ajusta drift
    const dashCfg={...cfg,drift:dashDrift};
    const pending=['A','B','C','D','CB'].filter(k=>dashSel[k]);
    const totalStages=pending.length;let stageIdx=0;
    const result={A:null,B:null,C:null,D:null,CB:null};
    const advance=()=>{stageIdx++;setDashProgress(stageIdx/totalStages);};
    const nextStage=()=>{
      if(stageIdx>=totalStages){
        setDash({...result,n:dashN,ak:dashAk,eo:dashEo,drift:dashDrift});setDashBusy(false);setDashStage('');return;
      }
      const k=pending[stageIdx];setDashStage(k);
      const onFrame=(done,total)=>setDashProgress((stageIdx+done/total)/totalStages);
      const onDone=(r)=>{result[k]=r;advance();nextStage();};
      if(k==='A')simMC_async(Object.keys(SA_RANKING),SA_RANKING,SAT,SA_RES,dashCfg,'A',dashN,dashAk,dashEo,onFrame,onDone);
      else if(k==='B')simMC_async(Object.keys(SB_RANKING),SB_RANKING,SBT,SB_RES,dashCfg,'B',dashN,dashAk,dashEo,onFrame,onDone);
      else if(k==='C')simMC_async(Object.keys(SC_RANKING),SC_RANKING,SCT,SC_RES,dashCfg,'C',dashN,dashAk,dashEo,onFrame,onDone);
      else if(k==='D')simMC_D_async(dashCfg,dashN,dashAk,dashEo,onFrame,onDone);
      else if(k==='CB'){
        // Copa BR: preferencialmente use Elos/atk/def EVOLUÍDOS das sims das outras séries.
        // Fallback: ranking nominal se a série não foi simulada nesta rodada.
        const evolved={elos:{...allElos},ad:{}};
        for(const t in allTeams)evolved.ad[t]={atk:allTeams[t].atk,def:allTeams[t].def};
        for(const sk of['A','B','C','D']){
          if(result[sk]&&result[sk].probs){
            for(const p of result[sk].probs){
              if(p.eloFinal!=null)evolved.elos[p.time]=p.eloFinal;
              if(p.atkFinal!=null&&p.defFinal!=null)evolved.ad[p.time]={atk:p.atkFinal,def:p.defFinal};
            }
          }
        }
        setTimeout(()=>{result.CB=simMC_CB(dashCfg,dashN,dashAk,dashEo,evolved.elos,evolved.ad);advance();nextStage();},10);
      }
    };
    setTimeout(nextStage,10);
  },[cfg,dashN,dashAk,dashEo,dashDrift,SAT,SBT,SCT,allElos,allTeams,dashSel]);

  // Auto-rodar "Simular Tudo" na primeira carga da página, com defaults atuais
  // (10k sims, drift médio, todas as séries). Useref garante que dispara apenas
  // uma vez (não dispara em re-renders subsequentes).
  const autoRanRef=useRef(false);
  useEffect(()=>{
    if(!autoRanRef.current){autoRanRef.current=true;runAll();}
  },[runAll]);

  const tabs=[{id:'serieA',l:'Série A',e:'🏆'},{id:'serieB',l:'Série B',e:'🥈'},{id:'serieC',l:'Série C',e:'🥉'},{id:'serieD',l:'Série D',e:'🏟️'},{id:'copaBR',l:'Copa BR',e:'🏅'},{id:'h2h',l:'Confronto',e:'⚔️'},{id:'config',l:'Config',e:'⚙️'}];
  return(<div style={{fontFamily:"'Outfit',sans-serif"}} className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 text-white p-3 sm:p-6">
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-4">
        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-300 via-white to-emerald-300 bg-clip-text text-transparent tracking-tight">Simulador Brasileirão 2026</h1>
        <p className="text-slate-400 text-xs mt-1">Motor unificado | Poisson + ELO + ATK/DEF | Config: total+pesoCasa</p>
        <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg px-2 py-1 border border-slate-700" title="Perfil de sensibilidade (alpha) — controla o quanto os ratings ATK/DEF reagem a cada jogo">{Object.entries(cfg.alphas).map(([k,a])=>(<button key={k} onClick={()=>setDashAk(k)} className={`px-2 py-0.5 rounded text-xs transition-colors ${dashAk===k?'bg-amber-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{a.label}</button>))}<InfoTooltip text="Alpha controla a velocidade de atualização dos ratings ATK/DEF após cada jogo. Conservador = reage pouco; Agressivo = reage muito."/></div>
          <button onClick={()=>setDashEo(!dashEo)} title={dashEo?'Usar só ELO para calcular probabilidades':'Usar ATK/DEF (estilo Dixon-Coles) — default'} className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${dashEo?'bg-amber-600/30 border-amber-500 text-amber-300':'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}>{dashEo?'ELO puro':'ATK/DEF'}</button>
          <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg px-2 py-1 border border-slate-700" title="Número de simulações Monte Carlo — mais = mais precisão, menos = mais rápido">{[1000,3000,10000,50000].map(n=>(<button key={n} onClick={()=>setDashN(n)} className={`px-2 py-0.5 rounded text-xs transition-colors ${dashN===n?'bg-amber-600 text-white':'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{n>=1000?`${n/1000}k`:n}</button>))}</div>
          <select value={dashDrift} onChange={e=>setDashDrift(Number(e.target.value))} title="Drift estocástico: perturbação aleatória acumulada em Elo + ATK/DEF a cada rodada futura" className="px-2 py-1 rounded-lg text-xs bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600 transition-colors"><option value={0}>Drift: Off</option><option value={5}>Drift: Baixo</option><option value={10}>Drift: Médio</option><option value={15}>Drift: Alto</option></select>
          <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-lg px-1.5 py-1 border border-slate-700" title="Séries a incluir no 'Simular Tudo'">
            {[{k:'A',l:'A'},{k:'B',l:'B'},{k:'C',l:'C'},{k:'D',l:'D'},{k:'CB',l:'CB'}].map(s=>(<button key={s.k} onClick={()=>toggleSel(s.k)} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${dashSel[s.k]?'bg-emerald-600/80 text-white':'bg-slate-700 text-slate-500 hover:bg-slate-600'}`}>{s.l}</button>))}
          </div>
          <button onClick={runAll} disabled={dashBusy} className="px-4 py-1.5 bg-gradient-to-r from-amber-600 to-amber-500 rounded-lg font-semibold text-xs disabled:opacity-50 shadow-lg shadow-amber-600/20 hover:shadow-xl hover:shadow-amber-600/40 hover:from-amber-500 hover:to-amber-400 transition-all duration-200 relative overflow-hidden min-w-[140px]">
            {dashBusy&&<div className="absolute inset-0 bg-amber-700/50" style={{clipPath:`inset(0 ${(1-dashProgress)*100}% 0 0)`}}></div>}
            <span className="relative">{dashBusy?`${dashStage} · ${Math.round(dashProgress*100)}%`:'⚡ Simular Tudo'}</span>
          </button>
          <button onClick={()=>setShowSearch(!showSearch)} className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${showSearch?'bg-emerald-600 border-emerald-500 text-white':'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}>🔍 Buscar</button>
        </div>
      </div>
      {showSearch&&<div className="mb-4"><SearchPanel onResults={handleSearchResults}/>{(fetchedRes.A.length+fetchedRes.B.length+fetchedRes.C.length)>0&&<div className="mt-2 flex items-center justify-between bg-emerald-900/20 rounded-lg p-2 border border-emerald-600/30"><span className="text-xs text-emerald-300">{fetchedRes.A.length+fetchedRes.B.length+fetchedRes.C.length} resultado(s) buscado(s) (A:{fetchedRes.A.length} B:{fetchedRes.B.length} C:{fetchedRes.C.length})</span><button onClick={()=>setFetchedRes({A:[],B:[],C:[]})} className="text-xs text-red-400 hover:text-red-300">Limpar</button></div>}</div>}
      {dash&&<div className="mb-4 bg-gradient-to-br from-slate-800/50 to-slate-900/40 backdrop-blur-sm rounded-2xl p-4 border border-amber-600/30 shadow-xl shadow-amber-900/10">
        <h3 className="text-sm font-bold text-amber-300 mb-3 tracking-tight">Dashboard — {dash.n.toLocaleString()} sims · {cfg.alphas[dash.ak||'base'].label} · {dash.eo?'ELO puro':'ATK/DEF'}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {[
            {k:'A',l:'Série A',c:'text-yellow-300',m:'pts',metricKey:'titulo',metricLabel:'Título%'},
            {k:'B',l:'Série B',c:'text-blue-300',m:'ptsAc',metricKey:'bAccess',metricLabel:'Acesso%'},
            {k:'C',l:'Série C',c:'text-emerald-300',m:'ptsAc',metricKey:'q4',metricLabel:'Acesso%'},
            {k:'D',l:'Série D',c:'text-purple-300',m:'ac',metricKey:'ac',metricLabel:'Acesso%'},
            {k:'CB',l:'Copa BR',c:'text-amber-300',m:'ch',metricKey:'ch',metricLabel:'Título%'}
          ].map(s=>{const d=dash[s.k];if(!d)return null;
            // A/B/C ordenam por pontos medianos esperados (mais intuitivo que % acesso/título);
            // D mantém ordenação por % acesso; CB por % título.
            const sorted=s.m==='pts'||s.m==='ptsAc'?[...d.probs].sort((a,b)=>(b.medianPts||0)-(a.medianPts||0)):d.probs;
            const isExpanded=dashExpanded[s.k];
            const limit=isExpanded?sorted.length:8;
            // Métrica de "risco" para expandir:
            //   A/B/C: z4 (últimos 4, rebaixamento direto)
            //   D: F3% = chegou à 3ª fase do mata-mata (top-32 de 96).
            //      Após v4.24 cada label de fase significa "CHEGOU a essa fase",
            //      então F3 = quem venceu a 2ª fase (top-32). Os 32 garantem
            //      vaga na D 2027 (4 promovidos + 28 permanecem por ranking).
            //      Os demais 64 voltam para competições estaduais.
            const riskKey=s.k==='D'?'f3':'z4';
            const riskLabel=s.k==='D'?'F3%':'Reb%';
            const isD=s.k==='D';
            return(<div key={s.k} className="bg-slate-900/60 backdrop-blur-sm rounded-xl p-3 border border-slate-700/40 hover:border-slate-600/60 transition-colors">
            <h4 className={`text-sm font-bold ${s.c} mb-1 tracking-tight`}>{s.l}</h4>
            <div className="text-[10px] text-slate-600 mb-2 font-mono uppercase tracking-wide">{isD?`Grupo · ${s.metricLabel} · ${riskLabel}`:`Pts mediano · ${s.metricLabel}${isExpanded?` · ${riskLabel}`:''}`}</div>
            <div className="space-y-1 max-h-[520px] overflow-y-auto">{sorted.slice(0,limit).map((p,i)=>{
              // Para D: rebValue = F3% (probabilidade de chegar à 3ª fase, top-32 de 96).
              // É métrica POSITIVA (alto = bom): vai bem na fase de grupos + vence a 2ª fase.
              // F3% para D fica SEMPRE visível (não condicional ao expand) por ser informativa.
              // Para A/B/C: rebValue = z4 (% rebaixamento, métrica NEGATIVA), só ao expandir.
              const rebValue=isD?(p.f3||0):(p.z4||0);
              const showReb=isExpanded||isD;
              // Cores invertidas para D (alto F3 = verde, baixo = cinza); para A/B/C mantém vermelho/âmbar.
              const rebColor=isD
                ?(rebValue>50?'text-emerald-300':rebValue>20?'text-emerald-400':'text-slate-500')
                :(rebValue>50?'text-red-400':rebValue>20?'text-amber-400':'text-slate-500');
              return(
              <div key={p.time||i} className="flex items-center gap-1.5 text-[13px]" title={p.time}>
                <span className="text-slate-500 font-mono text-[10px] w-4 text-right flex-shrink-0">{i+1}</span>
                <span className="flex-1 min-w-0 font-medium truncate">{p.time}</span>
                {s.m==='pts'||s.m==='ptsAc'?
                  <span className="flex gap-1 flex-shrink-0 items-center"><span className="font-mono text-emerald-300 text-xs">{p.medianPts||Math.round(p.mediaPts||0)}</span><span className="font-mono text-yellow-400 text-xs w-8 text-right">{Math.round(p[s.metricKey]||0)}%</span>{showReb&&<span className={`font-mono text-xs w-8 text-right ${rebColor}`}>{Math.round(rebValue)}%</span>}</span>
                  :s.m==='ac'?<span className="flex gap-1 flex-shrink-0 items-center">{isD&&p.grupo!=null&&<span className="font-mono text-slate-500 text-[9px] w-7 text-right">{SD_GL[p.grupo].split('·')[0]}</span>}<span className="font-mono text-blue-400 text-xs w-9 text-right">{isD?Math.round(p.ac||0):(p.ac||0).toFixed(1)}%</span>{showReb&&<span className={`font-mono text-xs w-9 text-right ${rebColor}`}>{Math.round(rebValue)}%</span>}</span>
                  :<span className="font-mono text-yellow-400 text-xs flex-shrink-0">{Math.round(p.ch||0)}%</span>}
              </div>);
            })}</div>
            {sorted.length>8&&<button onClick={()=>toggleExpanded(s.k)} className="mt-2 w-full text-[11px] text-slate-400 hover:text-emerald-300 py-1 border-t border-slate-700/30 transition-colors">
              {isExpanded?'▲ Mostrar só top 8':`▼ Ver todos (${sorted.length})${isD?'':' + rebaixamento'}`}
            </button>}
            {d.cortes&&!isExpanded&&<div className="mt-2 pt-2 border-t border-slate-700/30 text-[10px] text-slate-500 font-mono">T:{d.cortes.titulo.p50} G4:{d.cortes.g4.p50} Z4:{d.cortes.z4.p50}</div>}
          </div>);})}
        </div>
      </div>}
      <div className="flex gap-0.5 mb-4 bg-slate-800/60 rounded-2xl p-1 border border-slate-700/50 overflow-x-auto">{tabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} className={`flex-1 py-2 px-0.5 rounded-xl text-[11px] sm:text-sm font-medium whitespace-nowrap transition-all ${tab===t.id?'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg':'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}><span className="mr-0.5">{t.e}</span>{t.l}</button>))}</div>
      {tab==='serieA'&&<LeagueSim times={Object.keys(SA_RANKING)} ranking={SA_RANKING} tabela={SAT} res={SA_RES} meta={SA_META} cfg={cfg} extraRes={fetchedRes.A} initialMC={dash?.A} initialAk={dash?.ak} initialEo={dash?.eo} initialDrift={dash?.drift}/>}
      {tab==='serieB'&&<LeagueSim times={Object.keys(SB_RANKING)} ranking={SB_RANKING} tabela={SBT} res={SB_RES} meta={SB_META} cfg={cfg} extraRes={fetchedRes.B} initialMC={dash?.B} initialAk={dash?.ak} initialEo={dash?.eo} initialDrift={dash?.drift}/>}
      {tab==='serieC'&&<LeagueSim times={Object.keys(SC_RANKING)} ranking={SC_RANKING} tabela={SCT} res={SC_RES} meta={SC_META} cfg={cfg} extraRes={fetchedRes.C} initialMC={dash?.C} initialAk={dash?.ak} initialEo={dash?.eo} initialDrift={dash?.drift}/>}
      {tab==='serieD'&&<SerieDSim cfg={cfg} initialMC={dash?.D} initialAk={dash?.ak} initialEo={dash?.eo} initialDrift={dash?.drift} extraRes={fetchedRes.D}/>}
      {tab==='copaBR'&&<CopaBrasilSim cfg={cfg} allElos={allElos} allTeams={allTeams} initialMC={dash?.CB} initialAk={dash?.ak} initialEo={dash?.eo} initialDrift={dash?.drift}/>}
      {tab==='h2h'&&<ConfrontoMerged cfg={cfg} allTeams={allTeams}/>}
      {tab==='config'&&<SettingsTab cfg={cfg} setCfg={setCfg} dataHealth={dataHealth} fixtureCheck={fixtureCheck} onResults={handleSearchResults} fetchedRes={fetchedRes} onClearFetched={()=>setFetchedRes({A:[],B:[],C:[],D:[]})}/>}
      <div className="mt-4 text-center text-slate-500 text-xs"><p>A:{SA_RES.length} jogos (R18) | B:{SB_RES.length} (R11) | C:{SC_RES.length} (R9) | D:{SD_RES.length} (R9) | Copa BR: R16 (editável) | v4.44 — chances detalhadas por grupo na Série D</p></div>
    </div>
  </div>);
}
