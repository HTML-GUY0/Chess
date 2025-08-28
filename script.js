/*
  script.js — same chess script with move-history arrows.
  Updated: arrow buttons use images named "arrow-left.png" and "arrow-right.png".
  If the images fail to load, the buttons gracefully fall back to text arrows.
  The arrows are placed just below the New Game button.
*/

(function(){
  'use strict';

  /* ========== CONFIG ========== */
  const PIECE_IMAGES = {
    w:{K:'pieces/wk.png',Q:'pieces/wq.png',R:'pieces/wr.png',B:'pieces/wb.png',N:'pieces/wn.png',P:'pieces/wp.png'},
    b:{K:'pieces/bk.png',Q:'pieces/bq.png',R:'pieces/br.png',B:'pieces/bb.png',N:'pieces/bn.png',P:'pieces/bp.png'}
  };
  const HIGHLIGHT = 'highlight.png';
  const PIECE_VALUE = {P:100,N:320,B:330,R:500,Q:900,K:20000};
  const MATE_VALUE = 1000000;

  /* ========== STATE ========= */
  let board = [];
  let currentTurn = 'w';
  let selected = null;
  let moved = {wK:false,bK:false,wR0:false,wR7:false,bR0:false,bR7:false};
  let lastMoveFrom = null;
  let lastMoveTo = null;

  let aiEnabled = false;
  let aiColor = 'b';
  let aiDepth = 3;
  let boardFlipped = false;

  let dragging = null;
  let isPointerDragging = false;
  let aiBusy = false;

  // History
  let historySnapshots = [];
  let snapshotIndex = -1;
  let viewingSnapshot = false;

  /* ========== DOM refs ========= */
  let boardEl = null;
  let turnIndicator = null;
  let newGameBtn = null;
  let controlsEl = null;
  let prevBtn = null;
  let nextBtn = null;

  /* ========== UTILITIES ========== */
  function safeLog(...args){ if(window.console) console.log(...args); }
  function safeError(...args){ if(window.console) console.error(...args); }

  function deepCopyBoard(src){
    return src.map(row => row.map(cell => cell ? { type: cell.type, color: cell.color } : null));
  }

  function pushSnapshot(){
    if(snapshotIndex < historySnapshots.length - 1){
      historySnapshots.length = snapshotIndex + 1;
    }
    historySnapshots.push({
      board: deepCopyBoard(board),
      currentTurn: currentTurn,
      lastMoveFrom: lastMoveFrom ? {row:lastMoveFrom.row, col:lastMoveFrom.col} : null,
      lastMoveTo: lastMoveTo ? {row:lastMoveTo.row, col:lastMoveTo.col} : null
    });
    snapshotIndex = historySnapshots.length - 1;
    updateArrowsDisabled();
  }

  function setViewingSnapshot(index){
    if(index < 0) index = 0;
    if(index >= historySnapshots.length) index = historySnapshots.length - 1;
    snapshotIndex = index;
    viewingSnapshot = (snapshotIndex !== historySnapshots.length - 1);
    updateArrowsDisabled();
    const snap = historySnapshots[snapshotIndex];
    renderBoard(snap.board, snap.currentTurn, snap.lastMoveFrom, snap.lastMoveTo, true);
  }

  function updateArrowsDisabled(){
    if(!prevBtn || !nextBtn) return;
    const atStart = snapshotIndex <= 0;
    const atEnd = snapshotIndex >= (historySnapshots.length - 1);
    prevBtn.disabled = atStart;
    nextBtn.disabled = atEnd;

    // Visual feedback for image opacity
    const pImg = prevBtn.querySelector('img');
    const nImg = nextBtn.querySelector('img');
    if(pImg) pImg.style.opacity = atStart ? '0.45' : '1';
    if(nImg) nImg.style.opacity = atEnd ? '0.45' : '1';
  }

  /* ========== BOARD & RULES ========= */
  function createInitialBoard(){
    board = [];
    board.push([{type:'R',color:'b'},{type:'N',color:'b'},{type:'B',color:'b'},{type:'Q',color:'b'},{type:'K',color:'b'},{type:'B',color:'b'},{type:'N',color:'b'},{type:'R',color:'b'}]);
    board.push(Array(8).fill(null).map(()=>({type:'P',color:'b'})));
    for(let r=2;r<6;r++) board.push(Array(8).fill(null));
    board.push(Array(8).fill(null).map(()=>({type:'P',color:'w'})));
    board.push([{type:'R',color:'w'},{type:'N',color:'w'},{type:'B',color:'w'},{type:'Q',color:'w'},{type:'K',color:'w'},{type:'B',color:'w'},{type:'N',color:'w'},{type:'R',color:'w'}]);
    moved = {wK:false,bK:false,wR0:false,wR7:false,bR0:false,bR7:false};
    lastMoveFrom = lastMoveTo = null;
  }

  function inBounds(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
  function isPathClear(fr,fc,tr,tc){
    const dr = Math.sign(tr-fr), dc = Math.sign(tc-fc);
    let r = fr + dr, c = fc + dc;
    while(r !== tr || c !== tc){
      if(board[r][c]) return false;
      r += dr; c += dc;
    }
    return true;
  }
  function findKing(color){
    for(let r=0;r<8;r++) for(let c=0;c<8;c++){
      const p = board[r][c];
      if(p && p.type === 'K' && p.color === color) return {row:r,col:c};
    }
    return null;
  }
  function isSquareAttacked(r,c,byColor){
    for(let i=0;i<8;i++) for(let j=0;j<8;j++){
      const p = board[i][j];
      if(p && p.color === byColor && isLegalMove(p,i,j,r,c,true)) return true;
    }
    return false;
  }

  function isLegalMove(p,fr,fc,tr,tc,ignoreCheck=false){
    if(!p) return false;
    if(!inBounds(tr,tc)) return false;
    const dest = board[tr][tc];
    if(dest && dest.color === p.color) return false;
    const dr = tr - fr, dc = tc - fc;
    let legal = false;
    switch(p.type){
      case 'P': {
        const dir = p.color === 'w' ? -1 : 1;
        const startRow = p.color === 'w' ? 6 : 1;
        if(dc === 0){
          if(dr === dir && !dest) legal = true;
          if(fr === startRow && dr === 2*dir && !dest && board[fr+dir][fc] == null) legal = true;
        }
        if(dr === dir && Math.abs(dc) === 1 && dest) legal = true;
        break;
      }
      case 'N':
        if((Math.abs(dr)===2 && Math.abs(dc)===1) || (Math.abs(dr)===1 && Math.abs(dc)===2)) legal = true;
        break;
      case 'B':
        if(Math.abs(dr) === Math.abs(dc) && isPathClear(fr,fc,tr,tc)) legal = true;
        break;
      case 'R':
        if((dr===0 || dc===0) && isPathClear(fr,fc,tr,tc)) legal = true;
        break;
      case 'Q':
        if((dr===0 || dc===0 || Math.abs(dr)===Math.abs(dc)) && isPathClear(fr,fc,tr,tc)) legal = true;
        break;
      case 'K':
        if(Math.abs(dr)<=1 && Math.abs(dc)<=1) legal = true;
        break;
    }

    // Castling (basic)
    if(p.type === 'K' && !moved[p.color+'K'] && dr===0 && Math.abs(dc)===2){
      if(dc === 2 && board[fr][fc+1] == null && board[fr][fc+2] == null &&
         !isSquareAttacked(fr,fc,p.color==='w'?'b':'w') &&
         !isSquareAttacked(fr,fc+1,p.color==='w'?'b':'w') &&
         !isSquareAttacked(fr,fc+2,p.color==='w'?'b':'w')) legal = true;
      if(dc === -2 && board[fr][fc-1] == null && board[fr][fc-2] == null && board[fr][fc-3] == null &&
         !isSquareAttacked(fr,fc,p.color==='w'?'b':'w') &&
         !isSquareAttacked(fr,fc-1,p.color==='w'?'b':'w') &&
         !isSquareAttacked(fr,fc-2,p.color==='w'?'b':'w')) legal = true;
    }

    if(!legal) return false;
    if(ignoreCheck) return true;

    const backup = board[tr][tc];
    board[tr][tc] = p;
    board[fr][fc] = null;
    const kingPos = findKing(p.color);
    const inCheck = kingPos && isSquareAttacked(kingPos.row, kingPos.col, p.color === 'w' ? 'b' : 'w');
    board[fr][fc] = p;
    board[tr][tc] = backup;
    return !inCheck;
  }

  function applyMove(fr,fc,tr,tc){
    const p = board[fr][fc];
    if(!p) return false;
    if(p.type === 'K' && Math.abs(tc - fc) === 2){
      if(tc > fc){ board[fr][5] = board[fr][7]; board[fr][7] = null; moved[p.color+'R7']=true; }
      else { board[fr][3] = board[fr][0]; board[fr][0] = null; moved[p.color+'R0']=true; }
    }
    board[fr][fc] = null;
    if(p.type === 'P' && (p.color === 'w' && tr === 0 || p.color === 'b' && tr === 7)) p.type = 'Q';
    board[tr][tc] = p;
    if(p.type === 'K') moved[p.color+'K'] = true;
    if(p.type === 'R'){
      if(fr===7 && fc===0) moved['wR0'] = true;
      if(fr===7 && fc===7) moved['wR7'] = true;
      if(fr===0 && fc===0) moved['bR0'] = true;
      if(fr===0 && fc===7) moved['bR7'] = true;
    }
    lastMoveFrom = {row:fr,col:fc};
    lastMoveTo = {row:tr,col:tc};
    currentTurn = currentTurn === 'w' ? 'b' : 'w';

    pushSnapshot();
    return true;
  }

  /* ========== AI functions (kept minimal/unmodified) ========= */
  function generateAllLegalMoves(color){
    const moves = [];
    for(let r=0;r<8;r++){
      for(let c=0;c<8;c++){
        const p = board[r][c];
        if(!p || p.color !== color) continue;
        for(let tr=0;tr<8;tr++){
          for(let tc=0;tc<8;tc++){
            if(isLegalMove(p,r,c,tr,tc)){
              moves.push({fr:r,fc:c,tr:tr,tc:tc, captured: board[tr][tc] ? board[tr][tc].type : null});
            }
          }
        }
      }
    }
    return moves;
  }

  function makeMoveSim(fr,fc,tr,tc){
    const p = board[fr][fc];
    const captured = board[tr][tc];
    const movedSnapshot = {...moved};
    const prevLastFrom = lastMoveFrom ? {...lastMoveFrom} : null;
    const prevLastTo = lastMoveTo ? {...lastMoveTo} : null;
    const originalType = p ? p.type : null;
    const rookMove = {performed:false, from:null, to:null, piece:null};

    if(p && p.type === 'K' && Math.abs(tc - fc) === 2){
      if(tc > fc){
        rookMove.performed = true;
        rookMove.from = {r:fr, c:7};
        rookMove.to   = {r:fr, c:5};
        rookMove.piece = board[fr][7];
        board[fr][5] = board[fr][7];
        board[fr][7] = null;
        moved[p.color+'R7'] = true;
      } else {
        rookMove.performed = true;
        rookMove.from = {r:fr, c:0};
        rookMove.to   = {r:fr, c:3};
        rookMove.piece = board[fr][0];
        board[fr][3] = board[fr][0];
        board[fr][0] = null;
        moved[p.color+'R0'] = true;
      }
    }

    board[tr][tc] = p;
    board[fr][fc] = null;

    let promoted = false;
    if(p && p.type === 'P' && ((p.color==='w' && tr===0) || (p.color==='b' && tr===7))){
      p.type = 'Q'; promoted = true;
    }

    if(p && originalType === 'K') moved[p.color+'K'] = true;
    if(p && originalType === 'R'){
      if(fr===7 && fc===0) moved['wR0'] = true;
      if(fr===7 && fc===7) moved['wR7'] = true;
      if(fr===0 && fc===0) moved['bR0'] = true;
      if(fr===0 && fc===7) moved['bR7'] = true;
    }

    const prevLast = {from: prevLastFrom, to: prevLastTo};
    lastMoveFrom = {row:fr,col:fc}; lastMoveTo = {row:tr,col:tc};

    return {fr,fc,tr,tc,p,captured,movedSnapshot,originalType,promoted,rookMove,prevLast};
  }

  function undoMoveSim(undo){
    const {fr,fc,tr,tc,captured,movedSnapshot,originalType,promoted,rookMove,prevLast} = undo;
    board[fr][fc] = board[tr][tc];
    board[tr][tc] = captured;
    if(promoted && board[fr][fc]) board[fr][fc].type = originalType;
    if(rookMove && rookMove.performed){
      board[rookMove.from.r][rookMove.from.c] = rookMove.piece;
      board[rookMove.to.r][rookMove.to.c] = null;
    }
    moved = {...movedSnapshot};
    lastMoveFrom = prevLast.from ? {...prevLast.from} : null;
    lastMoveTo = prevLast.to ? {...prevLast.to} : null;
  }

  function evaluateBoard(){
    let score = 0;
    for(let r=0;r<8;r++){
      for(let c=0;c<8;c++){
        const p = board[r][c];
        if(!p) continue;
        const val = (PIECE_VALUE[p.type] || 0);
        score += (p.color === 'w' ? val : -val);
      }
    }
    return score;
  }

  function minimax(depth, alpha, beta, color){
    if(depth === 0) return evaluateBoard();
    const moves = generateAllLegalMoves(color);
    if(moves.length === 0){
      const kingPos = findKing(color);
      const inCheck = kingPos && isSquareAttacked(kingPos.row, kingPos.col, color === 'w' ? 'b' : 'w');
      if(inCheck) return color === 'w' ? -MATE_VALUE : MATE_VALUE;
      return 0;
    }

    moves.sort((a,b)=>{
      const av = a.captured ? PIECE_VALUE[a.captured] || 0 : 0;
      const bv = b.captured ? PIECE_VALUE[b.captured] || 0 : 0;
      return bv - av;
    });

    if(color === 'w'){
      let maxEval = -Infinity;
      for(const m of moves){
        const undo = makeMoveSim(m.fr,m.fc,m.tr,m.tc);
        const evalScore = minimax(depth-1, alpha, beta, 'b');
        undoMoveSim(undo);
        maxEval = Math.max(maxEval, evalScore);
        alpha = Math.max(alpha, evalScore);
        if(beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for(const m of moves){
        const undo = makeMoveSim(m.fr,m.fc,m.tr,m.tc);
        const evalScore = minimax(depth-1, alpha, beta, 'w');
        undoMoveSim(undo);
        minEval = Math.min(minEval, evalScore);
        beta = Math.min(beta, evalScore);
        if(beta <= alpha) break;
      }
      return minEval;
    }
  }

  function findBestMoveFor(color, depth){
    const moves = generateAllLegalMoves(color);
    if(moves.length === 0) return null;
    moves.sort((a,b)=>{
      const av = a.captured ? PIECE_VALUE[a.captured] || 0 : 0;
      const bv = b.captured ? PIECE_VALUE[b.captured] || 0 : 0;
      return bv - av;
    });

    let bestMove = null;
    if(color === 'w'){
      let bestScore = -Infinity;
      for(const m of moves){
        const undo = makeMoveSim(m.fr,m.fc,m.tr,m.tc);
        const score = minimax(depth-1, -Infinity, Infinity, 'b');
        undoMoveSim(undo);
        if(score > bestScore){ bestScore = score; bestMove = m; }
      }
    } else {
      let bestScore = Infinity;
      for(const m of moves){
        const undo = makeMoveSim(m.fr,m.fc,m.tr,m.tc);
        const score = minimax(depth-1, -Infinity, Infinity, 'w');
        undoMoveSim(undo);
        if(score < bestScore){ bestScore = score; bestMove = m; }
      }
    }
    return bestMove;
  }

  function makeAIMove(){
    if(aiBusy || !aiEnabled || aiColor !== currentTurn) return;
    aiBusy = true;
    setTimeout(()=>{
      try{
        const best = findBestMoveFor(aiColor, aiDepth);
        if(best){
          applyMove(best.fr,best.fc,best.tr,best.tc);
          renderBoard();
          if(!checkGameStatus()) maybeTriggerAI();
        } else {
          checkGameStatus();
        }
      } catch(err){
        safeError('AI move error:', err);
      } finally {
        aiBusy = false;
      }
    }, 50);
  }

  function maybeTriggerAI(){
    if(aiEnabled && aiColor === currentTurn) setTimeout(makeAIMove, 120);
  }

  /* ========== RENDERING & UI ========= */
  function clearHighlights(){
    if(!boardEl) return;
    boardEl.querySelectorAll('.dot-highlight, .highlight').forEach(h=>h.remove());
    boardEl.querySelectorAll('.square').forEach(sq=>{
      sq.classList.remove('capture','selected','last-move');
    });
  }

  function renderBoard(boardState, turnState, lastFrom, lastTo, isSnapshot){
    if(!boardEl){
      safeError('renderBoard: boardEl not set');
      return;
    }
    clearHighlights();

    const useBoard = boardState || board;
    const useTurn = typeof turnState !== 'undefined' ? turnState : currentTurn;
    const useLastFrom = lastFrom || lastMoveFrom;
    const useLastTo = lastTo || lastMoveTo;

    boardEl.innerHTML = '';
    for(let dr=0; dr<8; dr++){
      for(let dc=0; dc<8; dc++){
        const logicalR = boardFlipped ? 7 - dr : dr;
        const logicalC = boardFlipped ? 7 - dc : dc;
        const sq = document.createElement('div');
        sq.className = 'square ' + (((dr + dc) % 2 === 0) ? 'light' : 'dark');
        sq.dataset.row = logicalR;
        sq.dataset.col = logicalC;
        boardEl.appendChild(sq);
      }
    }

    for(let r=0;r<8;r++){
      for(let c=0;c<8;c++){
        const sq = boardEl.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
        if(!sq) continue;
        if(useLastFrom && useLastFrom.row===r && useLastFrom.col===c) sq.classList.add('last-move');
        if(useLastTo && useLastTo.row===r && useLastTo.col===c) sq.classList.add('last-move');

        const p = useBoard[r][c];
        if(p){
          const img = document.createElement('img');
          img.className = 'piece';
          img.src = (PIECE_IMAGES[p.color] && PIECE_IMAGES[p.color][p.type]) ? PIECE_IMAGES[p.color][p.type] : '';
          img.alt = p.color === 'w' ? 'White '+p.type : 'Black '+p.type;
          img.draggable = false;
          img.dataset.row = r; img.dataset.col = c;

          if(!isSnapshot){
            img.addEventListener('pointerdown', piecePointerDown);
            img.addEventListener('contextmenu', e=>e.preventDefault());
          } else {
            img.style.pointerEvents = 'none';
          }

          sq.appendChild(img);
        }
      }
    }

    if(turnIndicator) turnIndicator.textContent = useTurn === 'w' ? 'White' : 'Black';
  }

  function showLegalMoves(r,c){
    clearHighlights();
    const p = board[r][c];
    if(!p || p.color !== currentTurn) return;
    const originSq = boardEl.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
    if(originSq) originSq.classList.add('selected');

    for(let tr=0;tr<8;tr++){
      for(let tc=0;tc<8;tc++){
        if(isLegalMove(p,r,c,tr,tc)){
          const sq = boardEl.querySelector(`.square[data-row="${tr}"][data-col="${tc}"]`);
          if(sq){
            if(board[tr][tc]) sq.classList.add('capture');
            const mark = document.createElement('img');
            mark.className = 'highlight';
            mark.src = HIGHLIGHT;
            mark.draggable = false;
            mark.style.pointerEvents = 'none';
            sq.appendChild(mark);
          }
        }
      }
    }
  }

  function handleClick(e){
    if(isPointerDragging) return;
    if(!boardEl) return;
    const sq = e.target.closest('.square');
    if(!sq) return;
    const r = parseInt(sq.dataset.row), c = parseInt(sq.dataset.col);
    const p = board[r][c];

    if(aiEnabled && aiColor === currentTurn) return;

    if(viewingSnapshot){
      setViewingSnapshot(historySnapshots.length - 1);
      viewingSnapshot = false;
      renderBoard();
      return;
    }

    if(selected){
      if(isLegalMove(board[selected.row][selected.col], selected.row, selected.col, r, c)){
        applyMove(selected.row, selected.col, r, c);
        selected = null;
        renderBoard();
        if(!checkGameStatus()) maybeTriggerAI();
        return;
      }
      selected = null;
      renderBoard();
    }

    if(p && p.color === currentTurn){
      selected = {row:r, col:c};
      showLegalMoves(r,c);
    }
  }

  function checkGameStatus(){
    let hasMove = false;
    outer: for(let r=0;r<8;r++){
      for(let c=0;c<8;c++){
        const p = board[r][c];
        if(p && p.color === currentTurn){
          for(let tr=0;tr<8;tr++){
            for(let tc=0;tc<8;tc++){
              if(isLegalMove(p,r,c,tr,tc)){ hasMove = true; break outer; }
            }
          }
        }
      }
    }
    const kingPos = findKing(currentTurn);
    const inCheck = kingPos && isSquareAttacked(kingPos.row, kingPos.col, currentTurn === 'w' ? 'b' : 'w');
    if(!hasMove){
      if(inCheck) alert((currentTurn==='w'?'White':'Black') + ' is checkmated!');
      else alert('Stalemate!');
      return true;
    }
    return false;
  }

  /* ========== Drag & Drop ========== */
  function piecePointerDown(e){
    try {
      const img = e.currentTarget;
      const r = parseInt(img.dataset.row), c = parseInt(img.dataset.col);
      const p = board[r][c];
      if(!p || p.color !== currentTurn) return;
      if(aiEnabled && aiColor === currentTurn) return;

      isPointerDragging = true;
      img.setPointerCapture && img.setPointerCapture(e.pointerId);

      dragging = {
        pieceEl: img,
        from: {row:r, col:c},
        origParent: img.parentElement,
        offsetX: e.clientX - img.getBoundingClientRect().left,
        offsetY: e.clientY - img.getBoundingClientRect().top
      };

      img.classList.add('dragging');
      img.style.position = 'fixed';
      img.style.left = (e.clientX - dragging.offsetX) + 'px';
      img.style.top = (e.clientY - dragging.offsetY) + 'px';
      img.style.width = getComputedStyle(img).width;
      img.style.height = getComputedStyle(img).height;
      document.body.appendChild(img);

      document.addEventListener('pointermove', piecePointerMove);
      document.addEventListener('pointerup', piecePointerUp, {once:true});
    } catch(err){
      safeError('pointerdown error:', err);
    }
  }

  function piecePointerMove(e){
    if(!dragging) return;
    const img = dragging.pieceEl;
    img.style.left = (e.clientX - dragging.offsetX) + 'px';
    img.style.top = (e.clientY - dragging.offsetY) + 'px';
  }

  function piecePointerUp(e){
    try {
      if(!dragging) return;
      const img = dragging.pieceEl;
      try { img.releasePointerCapture && img.releasePointerCapture(e.pointerId); } catch(_) {}
      img.classList.remove('dragging');
      const elem = document.elementFromPoint(e.clientX, e.clientY);
      const sq = elem ? elem.closest('.square') : null;
      let tr, tc;
      if(sq){ tr = parseInt(sq.dataset.row); tc = parseInt(sq.dataset.col); }
      else { tr = dragging.from.row; tc = dragging.from.col; }

      if(selected && !(selected.row === dragging.from.row && selected.col === dragging.from.col)) selected = null;
      if(isLegalMove(board[dragging.from.row][dragging.from.col], dragging.from.row, dragging.from.col, tr, tc)){
        applyMove(dragging.from.row, dragging.from.col, tr, tc);
        renderBoard();
        if(!checkGameStatus()) maybeTriggerAI();
      } else {
        dragging.origParent.appendChild(img);
        img.style.position = ''; img.style.left=''; img.style.top=''; img.style.width=''; img.style.height='';
      }
    } catch(err){
      safeError('pointerup error:', err);
    } finally {
      document.removeEventListener('pointermove', piecePointerMove);
      isPointerDragging = false;
      dragging = null;
    }
  }

  /* ========== CONTROLS & NEW GAME + ARROWS PLACEMENT (with images) ========= */

  function createImgButton(imgSrc, altText){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.padding = '6px';
    btn.style.background = 'transparent';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';

    const img = document.createElement('img');
    img.src = imgSrc;
    img.alt = altText || '';
    img.style.width = '22px';
    img.style.height = '22px';
    img.style.objectFit = 'contain';
    img.style.pointerEvents = 'none';
    img.style.userSelect = 'none';
    // fallback: if image fails, replace with text arrow
    img.addEventListener('error', function onerr(){
      img.removeEventListener('error', onerr);
      img.style.display = 'none';
      const text = document.createElement('span');
      text.textContent = altText && altText.indexOf('left')>=0 ? '←' : '→';
      text.style.fontSize = '1.05rem';
      text.style.color = 'var(--light)';
      btn.appendChild(text);
    });
    btn.appendChild(img);
    return btn;
  }

  function createAIControlsAndPlaceNewGameAndArrows(){
    controlsEl = document.querySelector('.controls');

    const existingBtn = document.getElementById('newGameBtn');
    if(existingBtn){
      newGameBtn = existingBtn;
    } else {
      const ng = document.createElement('button');
      ng.id = 'newGameBtn';
      ng.textContent = 'New Game';
      newGameBtn = ng;
    }

    if(!newGameBtn.__wired_newgame){
      newGameBtn.addEventListener('click', onNewGameClicked);
      newGameBtn.__wired_newgame = true;
    }

    boardEl = document.getElementById('board');
    if(boardEl){
      newGameBtn.style.display = 'block';
      newGameBtn.style.margin = '12px auto';
      boardEl.insertAdjacentElement('afterend', newGameBtn);
    } else if(controlsEl){
      if(newGameBtn.parentElement !== controlsEl) controlsEl.insertBefore(newGameBtn, controlsEl.firstChild);
    } else {
      if(!document.body.contains(newGameBtn)) document.body.appendChild(newGameBtn);
    }

    // arrows container directly after newGameBtn
    let arrowsContainer = document.getElementById('moveArrowsContainer');
    if(!arrowsContainer){
      arrowsContainer = document.createElement('div');
      arrowsContainer.id = 'moveArrowsContainer';
      arrowsContainer.style.display = 'flex';
      arrowsContainer.style.justifyContent = 'center';
      arrowsContainer.style.alignItems = 'center';
      arrowsContainer.style.gap = '12px';
      arrowsContainer.style.margin = '6px auto 0 auto';
      arrowsContainer.style.width = '100%';
      arrowsContainer.style.maxWidth = '360px';
    }

    // create prev/next using images (user-specified names)
    prevBtn = document.getElementById('prevMoveBtn');
    if(!prevBtn){
      prevBtn = createImgButton('arrow-left.png', 'arrow-left');
      prevBtn.id = 'prevMoveBtn';
      prevBtn.title = 'Previous position';
      prevBtn.addEventListener('click', ()=>{
        if(historySnapshots.length === 0) return;
        setViewingSnapshot(Math.max(0, snapshotIndex - 1));
      });
    }

    nextBtn = document.getElementById('nextMoveBtn');
    if(!nextBtn){
      nextBtn = createImgButton('arrow-right.png', 'arrow-right');
      nextBtn.id = 'nextMoveBtn';
      nextBtn.title = 'Next position';
      nextBtn.addEventListener('click', ()=>{
        if(historySnapshots.length === 0) return;
        setViewingSnapshot(Math.min(historySnapshots.length - 1, snapshotIndex + 1));
      });
    }

    // middle label
    const label = document.createElement('div');
    label.style.minWidth = '120px';
    label.style.textAlign = 'center';
    label.style.color = 'var(--light)';
    label.style.fontSize = '0.95rem';
    label.style.userSelect = 'none';
    label.textContent = 'View moves';

    arrowsContainer.innerHTML = '';
    arrowsContainer.appendChild(prevBtn);
    arrowsContainer.appendChild(label);
    arrowsContainer.appendChild(nextBtn);

    if(newGameBtn.nextSibling !== arrowsContainer){
      newGameBtn.insertAdjacentElement('afterend', arrowsContainer);
    }

    updateArrowsDisabled();

    // create AI controls inside .controls
    if(!controlsEl) return;
    controlsEl.innerHTML = '';

    const aiToggle = document.createElement('button');
    aiToggle.id = 'aiToggle';
    aiToggle.textContent = 'Play vs AI: ' + (aiEnabled ? 'On' : 'Off');
    aiToggle.addEventListener('click', ()=>{
      aiEnabled = !aiEnabled;
      aiToggle.textContent = 'Play vs AI: ' + (aiEnabled ? 'On' : 'Off');
      if(aiEnabled && aiColor === currentTurn) setTimeout(makeAIMove, 200);
      updateBoardOrientation();
    });
    controlsEl.appendChild(aiToggle);

    const colorSelect = document.createElement('select');
    colorSelect.id = 'aiColorSelect';
    ['b','w'].forEach(col=>{
      const opt = document.createElement('option');
      opt.value = col;
      opt.textContent = col === 'b' ? 'AI plays Black' : 'AI plays White';
      colorSelect.appendChild(opt);
    });
    colorSelect.value = aiColor;
    colorSelect.addEventListener('change', ()=>{
      aiColor = colorSelect.value;
      updateBoardOrientation();
      if(aiEnabled && aiColor === currentTurn) setTimeout(makeAIMove, 200);
    });
    controlsEl.appendChild(colorSelect);

    const depthSelect = document.createElement('select');
    depthSelect.id = 'aiDepthSelect';
    [1,2,3,4,5].forEach(d=>{
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = 'Depth ' + d;
      depthSelect.appendChild(opt);
    });
    depthSelect.value = aiDepth;
    depthSelect.addEventListener('change', ()=>{ aiDepth = parseInt(depthSelect.value,10) || 1; });
    controlsEl.appendChild(depthSelect);
  }

  function onNewGameClicked(){
    createInitialBoard();
    currentTurn = 'w';
    selected = null;
    lastMoveFrom = lastMoveTo = null;
    historySnapshots = [];
    snapshotIndex = -1;
    viewingSnapshot = false;
    pushSnapshot();
    renderBoard();
    if(aiEnabled && aiColor === currentTurn) setTimeout(makeAIMove, 200);
  }

  /* ========== INIT + SAFE START ========= */
  function updateBoardOrientation(){
    boardFlipped = (aiColor === 'w');
    if(viewingSnapshot && historySnapshots[snapshotIndex]){
      const snap = historySnapshots[snapshotIndex];
      renderBoard(snap.board, snap.currentTurn, snap.lastMoveFrom, snap.lastMoveTo, true);
    } else {
      renderBoard();
    }
  }

  function safeInit(){
    boardEl = document.getElementById('board');
    turnIndicator = document.getElementById('turnIndicator');
    controlsEl = document.querySelector('.controls');
    newGameBtn = document.getElementById('newGameBtn');

    if(!boardEl) safeError('Missing #board element in DOM. Please add <div id="board"></div> to your HTML.');
    if(!turnIndicator) safeError('Missing #turnIndicator element in DOM. Add <div id="turnIndicator"></div>.');

    if(boardEl) boardEl.addEventListener('click', handleClick);

    createInitialBoard();
    createAIControlsAndPlaceNewGameAndArrows();
    pushSnapshot();
    updateBoardOrientation();
    renderBoard();
    safeLog('script initialized with image arrows (arrow-left.png / arrow-right.png).');
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', safeInit);
  } else {
    setTimeout(safeInit, 1);
  }

})();