import React, { useState, useMemo, useEffect } from 'react';
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './App.css';

// 1. 최소 현금 흐름 알고리즘
function calculateSettlement(balances, players) {
  const debtors = [];
  const creditors = [];

  for (const [id, balance] of Object.entries(balances)) {
    const playerName = players.find(p => p.id === id)?.name || id;
    if (balance < 0) debtors.push({ name: playerName, amount: Math.abs(balance) });
    else if (balance > 0) creditors.push({ name: playerName, amount: balance });
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0, j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settleAmount = Math.min(debtor.amount, creditor.amount);

    transactions.push({ from: debtor.name, to: creditor.name, amount: settleAmount });
    debtor.amount -= settleAmount;
    creditor.amount -= settleAmount;

    if (debtor.amount === 0) i++;
    if (creditor.amount === 0) j++;
  }
  return transactions;
}

// 2. 상태 관리 훅
function useBettingSettlement() {
  const [players, setPlayers] = useState(() => {
    const saved = localStorage.getItem('bettingPlayers');
    return saved ? JSON.parse(saved) : [
      { id: 'p1', name: '1번' }, { id: 'p2', name: '2번' },
      { id: 'p3', name: '3번' }, { id: 'p4', name: '4번' }
    ];
  });
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('bettingHistory');
    return saved ? JSON.parse(saved) : [];
  });

  const [currentWinnerId, setCurrentWinnerId] = useState(players[0]?.id || 'p1');
  const [currentLoserAmounts, setCurrentLoserAmounts] = useState({});

  useEffect(() => { localStorage.setItem('bettingPlayers', JSON.stringify(players)); }, [players]);
  useEffect(() => { localStorage.setItem('bettingHistory', JSON.stringify(history)); }, [history]);

  const balances = useMemo(() => {
    const calcBalances = {};
    players.forEach(p => calcBalances[p.id] = 0);
    history.forEach(game => {
      let totalWinAmount = 0;
      game.losers.forEach(loser => {
        const amount = loser.amount || 0;
        if (calcBalances[loser.playerId] !== undefined) calcBalances[loser.playerId] -= amount;
        totalWinAmount += amount;
      });
      if (calcBalances[game.winnerId] !== undefined) calcBalances[game.winnerId] += totalWinAmount;
    });
    return calcBalances;
  }, [history, players]);

  const updatePlayerName = (id, newName) => setPlayers(players.map(p => p.id === id ? { ...p, name: newName } : p));
  const addPlayer = () => {
    const newId = `p${Date.now()}`;
    setPlayers([...players, { id: newId, name: `참가자${players.length + 1}` }]);
  };
  const deletePlayer = (idToDelete) => {
    if (players.length <= 2) { alert("최소 2명의 참가자가 필요합니다."); return; }
    const updatedPlayers = players.filter(p => p.id !== idToDelete);
    setPlayers(updatedPlayers);
    if (currentWinnerId === idToDelete) setCurrentWinnerId(updatedPlayers[0].id);
  };

  const addGameRecord = () => {
    const newRecord = {
      gameId: Date.now(),
      winnerId: currentWinnerId,
      losers: players.filter(p => p.id !== currentWinnerId).map(p => ({
        playerId: p.id,
        amount: Number(currentLoserAmounts[p.id]) || 0
      }))
    };
    setHistory([newRecord, ...history]);
    setCurrentLoserAmounts({});
  };

  const deleteRecord = (gameIdToDelete) => setHistory(history.filter(game => game.gameId !== gameIdToDelete));
  const resetAllData = () => {
    if (window.confirm("모든 기록을 초기화하시겠습니까?")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return { players, history, currentWinnerId, setCurrentWinnerId, currentLoserAmounts, setCurrentLoserAmounts, balances, updatePlayerName, addPlayer, deletePlayer, addGameRecord, deleteRecord, resetAllData };
}

// 3. 메인 화면 UI
export default function App() {
  const {
    players, history, currentWinnerId, setCurrentWinnerId, currentLoserAmounts, setCurrentLoserAmounts,
    balances, updatePlayerName, addPlayer, deletePlayer, addGameRecord, deleteRecord, resetAllData
  } = useBettingSettlement();

  const totalCurrentProfit = players.filter(p => p.id !== currentWinnerId).reduce((sum, p) => sum + (Number(currentLoserAmounts[p.id]) || 0), 0);
  const transactions = useMemo(() => calculateSettlement(balances, players), [balances, players]);

  const copyToClipboard = () => {
    if (transactions.length === 0) return alert("복사할 정산 내역이 없습니다.");
    let text = "[💰 정산 내역]\n\n";
    transactions.forEach(t => { text += `${t.from} ➔ ${t.to} : ${t.amount.toLocaleString()}원\n`; });
    text += "\n수고하셨습니다!";
    navigator.clipboard.writeText(text).then(() => alert("클립보드에 복사되었습니다!")).catch(err => alert("복사 실패: " + err));
  };

  const addQuickAmount = (playerId, amount) => {
    const current = Number(currentLoserAmounts[playerId]) || 0;
    setCurrentLoserAmounts({ ...currentLoserAmounts, [playerId]: current + amount });
  };

  // 🔥 [통계 데이터 가공 로직]
  const CHART_COLORS = ['#3182f6', '#f04452', '#00C49F', '#FFBB28', '#8884d8', '#ff8042'];
  
  // 1. 승률 데이터 (파이 차트)
  const winCounts = {};
  history.forEach(g => { winCounts[g.winnerId] = (winCounts[g.winnerId] || 0) + 1; });
  const pieData = Object.entries(winCounts).map(([id, count]) => ({
    name: players.find(p => p.id === id)?.name || '알수없음',
    value: count
  })).sort((a, b) => b.value - a.value);

  // 2. 수익 추이 데이터 (꺾은선 차트)
  const trendData = useMemo(() => {
    const data = [];
    let currentBals = {};
    players.forEach(p => currentBals[p.name] = 0);
    data.push({ name: '시작', ...currentBals });

    [...history].reverse().forEach((game, idx) => {
      let totalWin = 0;
      game.losers.forEach(l => {
        const pName = players.find(p => p.id === l.playerId)?.name;
        if (pName) {
          currentBals[pName] -= l.amount;
          totalWin += l.amount;
        }
      });
      const wName = players.find(p => p.id === game.winnerId)?.name;
      if (wName) currentBals[wName] += totalWin;
      
      data.push({ name: `${idx + 1}R`, ...currentBals });
    });
    return data;
  }, [history, players]);

  // 3. 뱃지 (타짜 & 호구)
  const sortedBalances = Object.entries(balances).sort((a, b) => b[1] - a[1]);
  const tazza = sortedBalances.length > 0 && sortedBalances[0][1] > 0 ? players.find(p => p.id === sortedBalances[0][0])?.name : null;
  const hogu = sortedBalances.length > 0 && sortedBalances[sortedBalances.length - 1][1] < 0 ? players.find(p => p.id === sortedBalances[sortedBalances.length - 1][0])?.name : null;

  return (
    <div className="container">
      <h1>배팅 정산기</h1>

      {/* 🔥 [신규] 명예의 전당 & 통계 대시보드 (기록이 1개 이상일 때만 표시) */}
      {history.length > 0 && (
        <section className="card dashboard-card">
          <h2>🏆 명예의 전당</h2>
          
          <div className="badges-container">
            {tazza && (
              <div className="badge tazza-badge">
                <div className="badge-icon">👑</div>
                <div className="badge-info">
                  <span className="badge-title">오늘의 타짜</span>
                  <strong className="badge-name">{tazza}</strong>
                </div>
              </div>
            )}
            {hogu && (
              <div className="badge hogu-badge">
                <div className="badge-icon">💸</div>
                <div className="badge-info">
                  <span className="badge-title">오늘의 호구</span>
                  <strong className="badge-name">{hogu}</strong>
                </div>
              </div>
            )}
          </div>

          <div className="charts-grid">
            <div className="chart-box">
              <h3>승리 횟수 (승률)</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={5} dataKey="value" label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value}번 승리`, '기록']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="chart-box">
              <h3>라운드별 수익 추이</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e8eb" />
                    <XAxis dataKey="name" tick={{fontSize: 12, fill: '#8b95a1'}} tickLine={false} />
                    <YAxis tick={{fontSize: 12, fill: '#8b95a1'}} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(value) => [`${value.toLocaleString()}원`, '순수익']} />
                    <Legend iconType="circle" wrapperStyle={{fontSize: '12px'}}/>
                    {players.map((p, index) => (
                      <Line key={p.id} type="monotone" dataKey={p.name} stroke={CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2} dot={{r: 3}} activeDot={{r: 6}} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 기존 레이아웃들 */}
      <div className="grid">
        <section className="card">
          <h2>참가자 관리</h2>
          <div className="player-list">
            {players.map(p => (
              <div key={p.id} className="player-input-group">
                <input type="text" value={p.name} onChange={(e) => updatePlayerName(p.id, e.target.value)} className="player-input" />
                <button onClick={() => deletePlayer(p.id)} className="btn-remove-player" aria-label="삭제">✕</button>
              </div>
            ))}
          </div>
          <button onClick={addPlayer} className="btn-secondary">인원 추가</button>
        </section>

        <section className="card">
          <div className="settlement-header">
            <h2>최종 정산 결과</h2>
            <button onClick={copyToClipboard} className="btn-copy">복사하기</button>
          </div>
          <div className="settlement-box">
            {transactions.length === 0 ? <p className="empty-text">정산할 내역이 없습니다.</p> : 
              transactions.map((t, idx) => (
                <div key={idx} className="transaction-item">
                  <span className="sender">{t.from}</span> <span className="arrow">➔</span> <span className="receiver">{t.to}</span>
                  <strong className="amount">{t.amount.toLocaleString()}원</strong>
                </div>
              ))
            }
          </div>
        </section>
      </div>

      <section className="card primary-card">
        <h2>게임 기록 입력</h2>
        <div className="record-input-group">
          <div className="winner-section">
            <label>승리자</label>
            <select value={currentWinnerId} onChange={(e) => { setCurrentWinnerId(e.target.value); setCurrentLoserAmounts({}); }}>
              {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="total-profit">총 수익 <span className="highlight-text">+{totalCurrentProfit.toLocaleString()}원</span></div>
          </div>
          <div className="losers-section">
            {players.filter(p => p.id !== currentWinnerId).map(p => (
              <div key={p.id} className="loser-input">
                <label>{p.name}님이 잃은 돈</label>
                <input type="number" placeholder="금액 입력" value={currentLoserAmounts[p.id] || ''} onChange={(e) => setCurrentLoserAmounts({...currentLoserAmounts, [p.id]: e.target.value})} />
                <div className="quick-amounts">
                  <button onClick={() => addQuickAmount(p.id, 100)} className="btn-quick">+1백</button>
                  <button onClick={() => addQuickAmount(p.id, 500)} className="btn-quick">+5백</button>
                  <button onClick={() => addQuickAmount(p.id, 1000)} className="btn-quick">+1천</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button onClick={addGameRecord} className="btn-primary">기록 저장하기</button>
      </section>

      <section className="card">
        <div className="history-header-wrapper">
          <h2>기록 히스토리</h2>
          <button onClick={resetAllData} className="btn-text-danger">초기화</button>
        </div>
        {history.length === 0 ? <p className="empty-text">아직 기록된 게임이 없습니다.</p> : (
          <ul className="history-list">
            {history.map((game, index) => {
              const winnerName = players.find(p => p.id === game.winnerId)?.name || '알 수 없음';
              const totalWin = game.losers.reduce((sum, l) => sum + l.amount, 0);
              return (
                <li key={game.gameId} className="history-item">
                  <div className="history-info">
                    <div className="history-header">
                      <span className="round-badge">{history.length - index} 라운드</span>
                      <strong>{winnerName}</strong> <span className="win-amount">(+{totalWin.toLocaleString()}원)</span>
                    </div>
                    <div className="history-losers">
                      {game.losers.map(l => l.amount > 0 ? `${players.find(p => p.id === l.playerId)?.name} -${l.amount}원` : '').filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button onClick={() => deleteRecord(game.gameId)} className="btn-text-danger">삭제</button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
      {/* 🔥 여기에 개발자 서명을 추가합니다! */}
      <footer className="app-footer">
        <p>Created by <strong>이훈제</strong></p>
      </footer>
    </div>
  );
}