// Utilitário compartilhado (pedido do Erick — v1.7.0, seção 5.59:
// PulseCycle e Announcement multi-área) para lidar com o novo
// relacionamento `areas` (many-to-many, checkbox de várias áreas de uma
// vez) ao lado do `areaId` legado (single/null = Geral).
//
// Compatibilidade: qualquer PulseCycle/Announcement criado ANTES dessa
// mudança sempre tem `areas` vazio — continua funcionando só com `areaId`,
// nenhum dado antigo muda de comportamento.
//
// Regra de resolução: se `areas` tiver 1+ itens, é esse o grupo de áreas
// do registro. Senão, cai no `areaId` único. Se os dois estiverem
// vazios/null, é GERAL — todas as áreas (retorna null, o mesmo sinal
// "sem filtro" já usado no código antigo).
type AreaGroupEntity = { areaId: string | null; areas?: { id: string }[] };

export function resolveGroupAreaIds(entity: AreaGroupEntity): string[] | null {
  if (entity.areas && entity.areas.length > 0) return entity.areas.map((a) => a.id);
  if (entity.areaId) return [entity.areaId];
  return null; // GERAL — todas as áreas, comportamento de sempre
}

// Where-clause Prisma (spread direto num `where`): casa registros GERAIS,
// OU escopados por um `areaId` legado dentro de `areaIds`, OU cujo grupo
// multi-área (`areas`) inclui alguma das áreas em `areaIds`. Serve tanto
// pra "essa área específica" (array de 1) quanto pra "qualquer uma destas
// áreas que eu gerencio" (array com várias).
export function areaGroupWhere(areaIds: string[]) {
  return {
    OR: [
      { areaId: null, areas: { none: {} } },
      { areaId: { in: areaIds } },
      { areas: { some: { id: { in: areaIds } } } },
    ],
  };
}

// Rótulo amigável do grupo de áreas de um ciclo/comunicado, pra telas de
// listagem (ex: "Ipatinga + Chapecó" em vez de só a área única/"Geral").
export function areaGroupLabel(entity: {
  areaId: string | null;
  area?: { name: string } | null;
  areas?: { name: string }[];
}): string {
  if (entity.areas && entity.areas.length > 0) {
    return entity.areas.map((a) => a.name).join(' + ');
  }
  return entity.area?.name ?? 'Geral';
}
