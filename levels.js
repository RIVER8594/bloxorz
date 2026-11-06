(function (root) {
  'use strict';
  const specs = [
    {
      name: '苏醒之室', chapter: 0, lesson: '横躺占两格，竖立占一格。站进光柱即可离开。',
      idea: '在出口旁的石台绕一下，准备竖立的落点。',
      map: ['###.......', '#S####....', '#########.', '.#########', '.....##E##', '......###.']
    },
    {
      name: '转角窄径', chapter: 0, lesson: '先在宽阔的石台调整姿态，再通过转角。',
      idea: '观察窄路的方向，横躺时两格都要有支撑。',
      map: ['######....', '#S#..####.', '###....##.', '.#####.###', '...#####E#', '.......###']
    },
    {
      name: '沉石之桥', chapter: 0, lesson: '竖立压下 ▣ 机关，桥会永久展开。',
      idea: '先竖立踩下 ▣，再到右侧的桥头调整姿态。',
      map: ['#####...####', '#S###...####', '###P#aa##E##', '#####...####', '#####...####'],
      mechanisms: [{ symbol: 'P', kind: 'pressure', bridge: 'a', label: '重压机关' }], required: ['P']
    },
    {
      name: '薄冰回廊', chapter: 1, lesson: '裂纹薄冰只能横躺经过，站起来会碎。',
      idea: '在两侧石台准备横躺方向，薄冰上不要站起。',
      map: ['#####...#####', '#S###...#####', '#####III##E##', '#####III#####', '#####...#####']
    },
    {
      name: '颠倒符文', chapter: 1, lesson: '☀ 需要头端落地，☾ 需要脚端落地。站错不会坠落。',
      idea: '先点亮月亮，再绕一圈改变头脚，让太阳点亮。',
      map: ['#######', '#S#####', '##N####', '####D##', '#######', '#####E#', '#######'],
      mechanisms: [{ symbol: 'D', kind: 'head', label: '日符文' }, { symbol: 'N', kind: 'feet', label: '月符文' }], required: ['D', 'N']
    },
    {
      name: '日月交错', chapter: 1, lesson: '先用头端点亮太阳开桥，再横躺经过薄冰。',
      idea: '太阳开启通道；月亮需要脚端接触，符文石台可以安全站立。',
      map: ['#####...#####', '#S###...#####', '##D##aaa#####', '#####...IIIII', '#####...#N#E#', '........#####'],
      mechanisms: [{ symbol: 'D', kind: 'head', bridge: 'a', label: '日符文' }, { symbol: 'N', kind: 'feet', label: '月符文' }], required: ['D', 'N']
    },
    {
      name: '回声之台', chapter: 2, lesson: '竖立踩 ◇，离开后留下回声。再走 3 步，桥会收起。',
      idea: '台上先准备好方向。离台不扣刻度，要在第 3 步完全落到石台。',
      map: ['#####...#####', '#S###...#####', '####Tttt##E##', '#####...#####', '#####...#####'],
      mechanisms: [{ symbol: 'T', kind: 'echo', bridge: 't', label: '回声台' }]
    },
    {
      name: '短暂与永恒', chapter: 2, lesson: '借回声桥抵达重压机关，让新的桥永久展开。',
      idea: '跨临时桥到右侧石台，踩下 ▣，再用下方永久桥前往出口。',
      map: ['#####...#####', '#S###...#####', '####Tttt##P##', '#####...#####', '#####...#####', '........##a##', '........##a##', '........#####', '........##E##', '........#####'],
      mechanisms: [{ symbol: 'T', kind: 'echo', bridge: 't', label: '回声台' }, { symbol: 'P', kind: 'pressure', bridge: 'a', label: '重压机关' }], required: ['P']
    },
    {
      name: '双重封印', chapter: 2, lesson: '先准备头脚姿态，再启动回声；日月都亮起才能离开。',
      idea: '先点亮左侧月亮，带着合适的身体方向跨桥，在右侧用头端点亮太阳。',
      map: ['#####...#####', '#SN##...#####', '####Tttt##D##', '#####...#####', '#####...#####', '........##a##', '........##a##', '........#####', '........##E##', '........#####'],
      mechanisms: [{ symbol: 'T', kind: 'echo', bridge: 't', label: '回声台' }, { symbol: 'N', kind: 'feet', label: '月符文' }, { symbol: 'D', kind: 'head', bridge: 'a', label: '日符文' }], required: ['D', 'N']
    },
    {
      name: '竖井之巅', chapter: 2, lesson: '薄冰 → 重压开路 → 日月解封 → 最后的回声。',
      idea: '按四段完成：先开永久桥，点亮日月，最后从回声台出发。',
      map: ['#####............', '#S###............', '###II............', '###IP............', '#####............', '..a..............', '..a..............', '#######...#####..', '##N####...#####..', '####D#Tttt##E##..', '#######...#####..', '#######...#####..'],
      mechanisms: [{ symbol: 'P', kind: 'pressure', bridge: 'a', label: '重压机关' }, { symbol: 'D', kind: 'head', label: '日符文' }, { symbol: 'N', kind: 'feet', label: '月符文' }, { symbol: 'T', kind: 'echo', bridge: 't', label: '回声台' }], required: ['P', 'D', 'N']
    }
  ];
  root.RollLevels = specs;
  if (typeof module !== 'undefined') module.exports = specs;
})(typeof globalThis !== 'undefined' ? globalThis : this);
