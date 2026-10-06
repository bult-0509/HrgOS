export const teamBingoThemes = {
  'team-1': { id:'phigros', character:'鸠', mascot:'geopelia', accent:'#a9dfff', surface:'#182936' },
  'team-2': { id:'arcaea', character:'光光', mascot:'hikari', accent:'#d5c1ff', surface:'#25203b' },
  'team-3': { id:'paradigm', character:'Para', mascot:'para', accent:'#aebdff', surface:'#1b2444' },
  'team-4': { id:'maimai', character:'莎露朵', mascot:'salt', accent:'#ffe7a4', surface:'#302936' },
  'team-5': { id:'community', character:'伊洛', mascot:'iro', accent:'#f5c8e1', surface:'#1c3147' }
} as const;

export function getTeamBingoTheme(teamId: string) {
  return teamBingoThemes[teamId as keyof typeof teamBingoThemes];
}
