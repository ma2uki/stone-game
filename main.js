// ゲーム状態
const gameState = {
    pyramid: [], // 石の配列 { col, row, type: 'h' or 'v' }
    currentAttempt: 1,
    startTime: null,
    gameComplete: false,
    maxAttempts: 10,
    weather: null, // 'rain', 'snow', null
    weatherTimer: null,
    draggingStone: null,
    mousePos: { x: 0, y: 0 },
    selectedStoneType: null, // ドラッグ中の岩のタイプ
    particles: [], // 天候パーティクル
    failureShake: 0, // 失敗時の揺れアニメーション
    failureMessage: null, // 失敗メッセージ
    touchDragging: false, // タッチドラッグ中か
    draggedStoneType: null, // タッチで選んだ石のタイプ
    
    // 難易度プロパティ
    experience: 0, // 累積経験値（回数ベース）
    rumbleEventChance: 0, // ガラガラ崩れるイベントの発生確率（初回0%から開始）
    lastWeatherTime: 0 // 最後に天候が発生した時刻
};

// ゲーム設定
const GAME_CONFIG = {
    cols: 7,
    maxStones: 10,
    targetStones: null, // 計算される
    stoneWidth: 80,
    stoneHeight: 40,
    startX: 100,
    startY: 450
};

// 初期化
function initGame() {
    GAME_CONFIG.targetStones = calculateTargetStones();
    gameState.pyramid = [];
    gameState.gameComplete = false;
    gameState.weather = null;
    gameState.draggingStone = null;
    gameState.selectedStoneType = null;
    gameState.particles = [];
    gameState.touchDragging = false;
    gameState.draggedStoneType = null;
    gameState.startTime = Date.now();
    gameState.lastWeatherTime = Date.now();
    document.getElementById('completeBtn').disabled = true;
    
    // 現在のゲームのガラガライベント発生確率を初期化
    // 経験値が高いほど確率が下がる（スキルで対抗できる）
    gameState.rumbleEventChance = 0.2 - (gameState.experience * 0.05); // 初回20%、経験値1回分で1%下がる（最低は0%）
    gameState.rumbleEventChance = Math.max(0, gameState.rumbleEventChance); // 負の値にならないようにクリップ
    
    // キャンバスのサイズを設定（レスポンシブ対応）
    const canvas = document.getElementById('gameCanvas');
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
        // モバイル: ウィンドウ幅に合わせる（マージンを除外）
        canvas.width = Math.min(window.innerWidth - 40, 600);
        canvas.height = 600;
    } else {
        // PC: 固定サイズ
        canvas.width = 800;
        canvas.height = 600;
    }
    
    // 天候を開始
    startWeatherSystem();
    
    // キャンバスにイベントリスナーを追加
    canvas.addEventListener('dragover', onCanvasDragOver);
    canvas.addEventListener('drop', onCanvasDrop);
    canvas.addEventListener('dragleave', onCanvasDragLeave);
    canvas.addEventListener('mousemove', onCanvasMouseMove);
    
    // タッチイベント
    canvas.addEventListener('touchmove', onCanvasTouchMove);
    canvas.addEventListener('touchend', onCanvasTouchEnd);
    
    // ドキュメント全体でタッチムーブを追跡（キャンバス外でも動作するように）
    document.addEventListener('touchmove', onCanvasTouchMove, { passive: false });
    document.addEventListener('touchend', onCanvasTouchEnd);
    
    // 石ボタンにタッチイベント
    const stoneButtons = document.querySelectorAll('.stone-button');
    stoneButtons.forEach(button => {
        button.addEventListener('touchstart', onStoneButtonTouchStart);
    });
    
    drawCanvas();
}

// 目標の石の数を計算 (下から上へ、徐々に減る)
function calculateTargetStones() {
    // 5〜6回でクリアできるように調整
    // 1回では絶対クリアできないように難易度を上げた
    // 下の方は多く、上に行くにつれ少なくなる
    let total = 0;
    for (let col = 0; col < GAME_CONFIG.cols; col++) {
        // より多くの石が必要になるように計算
        total += Math.floor(GAME_CONFIG.maxStones * Math.max(0.4, 1 - col / (GAME_CONFIG.cols * 1.0)));
    }
    // 30～50個で5～6回でクリア可能（1回では不可能）
    return Math.max(30, Math.min(50, total));
}

// 指定の列に今後置かれる石の行を計算
function calculateRowForColumn(col) {
    // その列に既に置かれている石の数をカウント
    const stonesInColumn = gameState.pyramid.filter(stone => stone.col === col).length;
    return stonesInColumn;
}

// キャンバスを描画
function drawCanvas() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // 揺れのオフセットを計算
    const shakeX = gameState.failureShake > 0 ? (Math.random() - 0.5) * gameState.failureShake : 0;
    const shakeY = gameState.failureShake > 0 ? (Math.random() - 0.5) * gameState.failureShake : 0;
    
    ctx.save();
    ctx.translate(shakeX, shakeY);
    
    // 背景をクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // グラデーション背景
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#87ceeb');
    gradient.addColorStop(1, '#e0f6ff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // グリッドラインを描画
    const isMobileView = window.innerWidth < 768;
    if (!isMobileView) {
        // PC: グリッドラインを描画
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
        ctx.lineWidth = 1;
        const stoneWidth = GAME_CONFIG.stoneWidth;
        
        for (let col = 0; col <= GAME_CONFIG.cols; col++) {
            const x = GAME_CONFIG.startX + col * stoneWidth;
            ctx.beginPath();
            ctx.moveTo(x, 100);
            ctx.lineTo(x, canvas.height - 100);
            ctx.stroke();
        }
    }
    
    // 地面を描画
    ctx.fillStyle = '#8b7355';
    if (isMobileView) {
        // モバイル: 画面全幅に地面を描画
        ctx.fillRect(0, canvas.height - 60, canvas.width, 50);
    } else {
        // PC: 中央に地面を描画
        ctx.fillRect(50, canvas.height - 60, canvas.width - 100, 50);
    }
    
    // 岩を描画
    gameState.pyramid.forEach((stone, index) => {
        drawStone(ctx, stone.col, stone.row, stone.type, index, stone.falling, canvas);
    });
    
    // 情報テキスト
    ctx.fillStyle = '#333';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`積み上げた石: ${gameState.pyramid.length}/${GAME_CONFIG.targetStones}`, 20, 50);
    
    // プログレスバー
    const progressWidth = 200;
    const progressHeight = 15;
    const progressX = canvas.width - progressWidth - 20;
    const progressY = 15;
    const progress = Math.min(gameState.pyramid.length / GAME_CONFIG.targetStones, 1);
    
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 2;
    ctx.strokeRect(progressX, progressY, progressWidth, progressHeight);
    
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(progressX, progressY, progressWidth * progress, progressHeight);
    
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    ctx.fillText(`${Math.round(progress * 100)}%`, progressX + progressWidth / 2 - 15, progressY + 25);
    
    ctx.restore();
    
    // ドラッグ中の石を描画（ctx.restore()の後で）
    if (gameState.touchDragging && gameState.draggedStoneType) {
        drawDraggingStone(ctx, {
            type: gameState.draggedStoneType,
            x: gameState.mousePos.x,
            y: gameState.mousePos.y
        });
    }
    
    // 天候表示（揺れに含めない）
    if (gameState.weather) {
        drawWeatherDisplay(ctx, canvas);
        updateWeatherParticles();
        drawWeatherEffect(ctx, canvas);
    }
    
    // 失敗メッセージ表示
    if (gameState.failureMessage) {
        drawFailureMessage(ctx, canvas);
    }
    
    // 揺れを減らす
    if (gameState.failureShake > 0) {
        gameState.failureShake *= 0.9;
        if (gameState.failureShake < 0.5) {
            gameState.failureShake = 0;
            gameState.failureMessage = null;
        }
    }
    
    // 次のフレームをリクエスト
    requestAnimationFrame(drawCanvas);
}

// 石を描画
function drawStone(ctx, col, row, type, index, falling = false, canvas = null) {
    const stoneWidth = GAME_CONFIG.stoneWidth;
    const stoneHeight = GAME_CONFIG.stoneHeight;
    
    // スマホ判定
    const isMobile = window.innerWidth < 768;
    
    let x, y, width, height;
    
    if (canvas) {
        // キャンバスのサイズに基づいて動的に計算（モバイル・PC両方対応）
        const colWidth = canvas.width / GAME_CONFIG.cols;
        
        // Y座標は下から積み上げる
        const baseY = canvas.height - 80; // 地面より上
        y = baseY - row * stoneHeight;
        
        if (type === 'h') {
            // 水平石: 列の中央に配置
            width = colWidth * 0.9; // 若干余白を持たせる
            height = stoneHeight;
            x = col * colWidth + (colWidth - width) / 2;
        } else {
            // 縦石: 列の中央に配置
            width = colWidth * 0.9;
            height = stoneHeight * 2;
            x = col * colWidth + (colWidth - width) / 2;
        }
    } else {
        // フォールバック（canvas未指定の場合）
        const startX = GAME_CONFIG.startX;
        const startY = GAME_CONFIG.startY;
        
        if (type === 'h') {
            width = stoneWidth * 2;
            height = stoneHeight;
            x = startX + col * stoneWidth;
            y = startY - row * stoneHeight;
        } else {
            width = stoneWidth;
            height = stoneHeight * 2;
            x = startX + col * stoneWidth;
            y = startY - row * stoneHeight - stoneHeight;
        }
    }
    
    // 落下中の処理
    if (falling) {
        y += falling.velocity * (Date.now() - falling.startTime) / 100;
        falling.velocity += 0.5; // 重力
    }
    
    // グラデーション（岩のような灰色）
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, '#9e9e9e');
    gradient.addColorStop(0.3, '#757575');
    gradient.addColorStop(0.7, '#616161');
    gradient.addColorStop(1, '#424242');
    
    ctx.fillStyle = gradient;
    
    // 岩のような角ばった形を描画
    ctx.beginPath();
    // 少し不規則な形にする
    const offset = 3;
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + width - offset, y + offset);
    ctx.lineTo(x + width, y + height - offset);
    ctx.lineTo(x + width - offset, y + height);
    ctx.lineTo(x + offset, y + height - offset);
    ctx.lineTo(x, y + offset);
    ctx.closePath();
    ctx.fill();
    
    // 明るい側のハイライト（左上）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + width * 0.3, y);
    ctx.lineTo(x + width * 0.2, y + height * 0.3);
    ctx.lineTo(x + offset + 2, y + 2);
    ctx.closePath();
    ctx.fill();
    
    // 暗い側の影（右下）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.beginPath();
    ctx.moveTo(x + width - offset, y + height);
    ctx.lineTo(x + width * 0.7, y + height);
    ctx.lineTo(x + width * 0.8, y + height * 0.7);
    ctx.lineTo(x + width - offset - 2, y + height - 2);
    ctx.closePath();
    ctx.fill();
    
    // 岩のテクスチャ（ざらざら感）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let i = 0; i < 15; i++) {
        const px = x + Math.random() * width;
        const py = y + Math.random() * height;
        const size = Math.random() * 1.5;
        ctx.fillRect(px, py, size, size);
    }
}

// ドラッグ中の石を描画
function drawDraggingStone(ctx, draggingStone) {
    const canvas = document.getElementById('gameCanvas');
    const isMobile = window.innerWidth < 768;
    
    let width, height;
    
    if (isMobile && canvas) {
        // モバイル: キャンバスサイズに合わせる
        const colWidth = canvas.width / GAME_CONFIG.cols;
        if (draggingStone.type === 'h') {
            width = colWidth * 0.9;
            height = GAME_CONFIG.stoneHeight;
        } else {
            width = colWidth * 0.9;
            height = GAME_CONFIG.stoneHeight * 2;
        }
    } else {
        // PC: 固定サイズ
        const stoneWidth = GAME_CONFIG.stoneWidth;
        const stoneHeight = GAME_CONFIG.stoneHeight;
        if (draggingStone.type === 'h') {
            width = stoneWidth * 2;
            height = stoneHeight;
        } else {
            width = stoneWidth;
            height = stoneHeight * 2;
        }
    }
    
    // マウス/タッチ位置を中心に配置（座標は画面座標の場合もあるので調整）
    let x = gameState.mousePos.x - width / 2;
    let y = gameState.mousePos.y - height / 2;
    
    // キャンバス内に留まるようにクリップ
    if (canvas) {
        x = Math.max(0, Math.min(x, canvas.width - width));
        y = Math.max(0, Math.min(y, canvas.height - height));
    }
    
    // グラデーション（オレンジ色でドラッグ中であることを示す）
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, '#ffb366');
    gradient.addColorStop(0.5, '#ff9944');
    gradient.addColorStop(1, '#ff8833');
    
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = gradient;
    
    // 岩のような形で描画
    ctx.beginPath();
    const offset = 3;
    ctx.moveTo(x + offset, y);
    ctx.lineTo(x + width - offset, y + offset);
    ctx.lineTo(x + width, y + height - offset);
    ctx.lineTo(x + width - offset, y + height);
    ctx.lineTo(x + offset, y + height - offset);
    ctx.lineTo(x, y + offset);
    ctx.closePath();
    ctx.fill();
    
    ctx.globalAlpha = 1;
}

// 天候エフェクトを描画
function drawWeatherEffect(ctx, canvas) {
    if (gameState.weather === 'rain') {
        drawRain(ctx, canvas);
    } else if (gameState.weather === 'snow') {
        drawSnow(ctx, canvas);
    }
}

// 雨を描画
function drawRain(ctx, canvas) {
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.6)';
    ctx.lineWidth = 2;
    
    const now = Date.now();
    const rainOffset = (now / 50) % 100;
    
    for (let i = 0; i < 30; i++) {
        const x = (i * 30 + rainOffset) % canvas.width;
        const y = ((i * 40 + now / 100) % canvas.height);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 10, y + 20);
        ctx.stroke();
    }
}

// 雪を描画
function drawSnow(ctx, canvas) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    
    const now = Date.now();
    const snowOffset = (now / 100) % canvas.height;
    
    for (let i = 0; i < 20; i++) {
        const x = (i * 60 + (now / 200) % 100) % canvas.width;
        const y = ((i * 80 + snowOffset) % (canvas.height + 50)) - 50;
        
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

// 天候パーティクルを更新
function updateWeatherParticles() {
    const now = Date.now();
    
    // パーティクルを追加
    if (gameState.particles.length < 50) {
        gameState.particles.push({
            x: Math.random() * 800,
            y: -10,
            vx: (Math.random() - 0.5) * 2,
            vy: 2 + Math.random() * 3,
            life: 1,
            type: gameState.weather
        });
    }
    
    // パーティクルを更新
    gameState.particles = gameState.particles.filter(p => {
        p.y += p.vy;
        p.x += p.vx;
        p.life -= 0.01;
        return p.y < 600 && p.life > 0;
    });
}

// 失敗メッセージを描画
function drawFailureMessage(ctx, canvas) {
    const alpha = gameState.failureShake > 0 ? Math.min(gameState.failureShake / 15, 1) : 0;
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // メッセージの背景
    ctx.fillStyle = '#ff5252';
    ctx.font = 'bold 24px Arial';
    const text = gameState.failureMessage;
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const x = (canvas.width - textWidth) / 2;
    const y = 100;
    
    // 背景
    ctx.fillRect(x - 20, y - 30, textWidth + 40, 50);
    
    // テキスト
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, y + 10);
    
    ctx.restore();
}

// 横に石を追加
function addHorizontalStone() {
    if (gameState.gameComplete || gameState.pyramid.length >= GAME_CONFIG.targetStones * 1.5) {
        return;
    }
    
    // ルール: 下の方は横が多い方がいいので、確率で追加
    const newStone = {
        col: Math.floor(Math.random() * (GAME_CONFIG.cols - 1)),
        row: Math.floor(gameState.pyramid.length / 3),
        type: 'h'
    };
    
    gameState.pyramid.push(newStone);
    updateProgress();
}

// 縦に石を追加
function addVerticalStone() {
    if (gameState.gameComplete || gameState.pyramid.length >= GAME_CONFIG.targetStones * 1.5) {
        return;
    }
    
    const newStone = {
        col: Math.floor(Math.random() * GAME_CONFIG.cols),
        row: Math.floor(gameState.pyramid.length / 4),
        type: 'v'
    };
    
    gameState.pyramid.push(newStone);
    updateProgress();
}

// 横に石を追加（使用不可になった）
// function addHorizontalStone() { ... }

// 縦に石を追加（使用不可になった）
// function addVerticalStone() { ... }

// 進捗を更新
function updateProgress() {
    const progress = gameState.pyramid.length / GAME_CONFIG.targetStones;
    
    if (progress >= 1) {
        document.getElementById('completeBtn').disabled = false;
    }
}

// ドラッグ&ドロップ機能 - 岩ボタンのドラッグ開始
function onStoneDragStart(e, type) {
    gameState.selectedStoneType = type;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('stoneType', type);
}

// ドラッグ&ドロップ機能 - 岩ボタンのドラッグ終了
function onStoneDragEnd(e) {
    gameState.selectedStoneType = null;
}

// キャンバスのドラッグオーバー
function onCanvasDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
}

// キャンバスのドラッグリーブ
function onCanvasDragLeave(e) {
    e.preventDefault();
}

// キャンバスへのドロップ
function onCanvasDrop(e) {
    e.preventDefault();
    
    if (gameState.gameComplete) return;
    
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const type = e.dataTransfer.getData('stoneType');
    
    // 配置可能か判定
    if (isValidPlacement(x, y)) {
        // スマホ判定
        const isMobile = window.innerWidth < 768;
        let col;
        
        if (isMobile) {
            // スマホ: キャンバス全幅を7列に分割
            // 各列の幅で割り、どの列かを計算
            const colWidth = canvas.width / GAME_CONFIG.cols;
            // 右端でも正確に列6に到達するよう+1を加える
            col = Math.floor((x + 1) / colWidth);
            // 範囲をクリップ
            col = Math.max(0, Math.min(GAME_CONFIG.cols - 1, col));
        } else {
            // PC: グリッドを基準に計算
            const startX = GAME_CONFIG.startX;
            col = Math.max(0, Math.min(GAME_CONFIG.cols - 1, Math.round((x - startX) / GAME_CONFIG.stoneWidth)));
        }
        
        gameState.pyramid.push({
            col: col,
            row: calculateRowForColumn(col),
            type: type
        });
        
        // 石を積むたびにガラガライベント発生確率が上がる
        // 試行回数が少ないほど確率が上がりやすい（初心者向け）
        if (gameState.currentAttempt < 5) {
            gameState.rumbleEventChance += 0.005;  // 1〜4回: +0.5%（確率が上がりやすい＝楽）
        } else if (gameState.currentAttempt < 10) {
            gameState.rumbleEventChance += 0.02;   // 5〜9回: +1%（標準難易度）
        } else {
            gameState.rumbleEventChance += 0.01;   // 10回以上: +2%（確率が上がりやすい＝難しい）
        }
        
        // イベント発生チェック（確率ベース）
        checkRumbleEvent();
        
        updateProgress();
    } else {
        // 失敗時のアクション
        triggerFailureShake();
    }
}

// キャンバスのマウスムーブ
function onCanvasMouseMove(e) {
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    gameState.mousePos.x = e.clientX - rect.left;
    gameState.mousePos.y = e.clientY - rect.top;
}

// 配置が有効か判定
function isValidPlacement(x, y, canvasWidth = 800) {
    // スマホ判定
    const isMobile = window.innerWidth < 768;
    
    if (isMobile) {
        // スマホ: 画面全体を使う（左右両端まで）
        // Y座標だけで判定、X座標は制限しない
        return y >= 200 && y <= 550;
    } else {
        // PC: グリッド内のみ
        const startX = GAME_CONFIG.startX;
        const endX = startX + GAME_CONFIG.cols * GAME_CONFIG.stoneWidth;
        return x >= startX && x <= endX && y >= 300 && y <= 520;
    }
}

// ========== スマホ対応 タッチイベント ==========

// 石ボタンがタッチされた
function onStoneButtonTouchStart(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const button = e.target.closest('.stone-button');
    if (!button) return;
    
    // どの岩か判定
    const isHorizontal = button.classList.contains('horizontal');
    gameState.draggedStoneType = isHorizontal ? 'h' : 'v';
    gameState.touchDragging = true;
}

// キャンバスがタッチムーブ
function onCanvasTouchMove(e) {
    if (!gameState.touchDragging) return;
    
    e.preventDefault();
    
    const touch = e.touches[0];
    const canvas = document.getElementById('gameCanvas');
    const rect = canvas.getBoundingClientRect();
    gameState.mousePos.x = touch.clientX - rect.left;
    gameState.mousePos.y = touch.clientY - rect.top;
}

// キャンバスがタッチ終了
function onCanvasTouchEnd(e) {
    if (!gameState.touchDragging || !gameState.draggedStoneType) {
        gameState.touchDragging = false;
        gameState.draggedStoneType = null;
        return;
    }
    
    const touch = e.changedTouches[0];
    const canvas = document.getElementById('gameCanvas');
    const rect = canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    // 配置可能か判定
    if (isValidPlacement(x, y)) {
        // スマホ判定
        const isMobile = window.innerWidth < 768;
        let col;
        
        if (isMobile) {
            // スマホ: キャンバス全幅を7列に分割
            // 各列の幅で割り、どの列かを計算
            const colWidth = canvas.width / GAME_CONFIG.cols;
            // 右端でも正確に列6に到達するよう+1を加える
            col = Math.floor((x + 1) / colWidth);
            // 範囲をクリップ
            col = Math.max(0, Math.min(GAME_CONFIG.cols - 1, col));
        } else {
            // PC: グリッドを基準に計算
            const startX = GAME_CONFIG.startX;
            col = Math.max(0, Math.min(GAME_CONFIG.cols - 1, Math.round((x - startX) / GAME_CONFIG.stoneWidth)));
        }
        
        gameState.pyramid.push({
            col: col,
            row: calculateRowForColumn(col),
            type: gameState.draggedStoneType
        });
        
        // 石を積むたびにガラガライベント発生確率が上がる
        // 試行回数が少ないほど確率が上がりやすい（初心者向け）
        if (gameState.currentAttempt < 5) {
            gameState.rumbleEventChance += 0.005;  // 1〜4回: +0.5%（確率が上がりやすい＝楽）
        } else if (gameState.currentAttempt < 10) {
            gameState.rumbleEventChance += 0.02;   // 5〜9回: +1%（標準難易度）
        } else {
            gameState.rumbleEventChance += 0.01;   // 10回以上: +2%（確率が上がりやすい＝難しい）
        }
        
        // イベント発生チェック（確率ベース）
        checkRumbleEvent();
        
        updateProgress();
    } else {
        // 失敗時のアクション
        triggerFailureShake();
    }
    
    gameState.touchDragging = false;
    gameState.draggedStoneType = null;
}

// 天候表示を描画
function drawWeatherDisplay(ctx, canvas) {
    // 背景で目立つようにする
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(canvas.width - 300, 0, 300, 80);
    
    // 天候テキスト
    ctx.fillStyle = gameState.weather === 'rain' ? '#4fc3f7' : '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'right';
    
    const weatherText = gameState.weather === 'rain' ? '🌧️ 雨' : '❄️ 雪';
    ctx.fillText(weatherText, canvas.width - 20, 50);
    
    ctx.textAlign = 'left';
}

// 失敗時の揺れを開始
function triggerFailureShake() {
    gameState.failureShake = 15;
    gameState.failureMessage = '配置できません！';
}

// 天候システムを開始
function startWeatherSystem() {
    // 5秒ごとに20%の確率で天候が発生（降水確率のイメージ）
    gameState.weatherTimer = setInterval(() => {
        if (gameState.gameComplete || gameState.weather) return;
        
        // 20%の確率で天候が発生
        if (Math.random() < 0.1 && !gameState.weather) {
            triggerWeather();
        }
    }, 10000);
}

// 天候を発生させる
function triggerWeather() {
    if (gameState.gameComplete) return;
    
    const weatherTypes = ['rain', 'snow'];
    gameState.weather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
    gameState.particles = [];
    gameState.lastWeatherTime = Date.now();
    
    // 3秒後に崩壊
    setTimeout(() => {
        if (gameState.pyramid.length > 0 && !gameState.gameComplete) {
            // 試行回数を+1（天候による崩壊）
            gameState.currentAttempt++;
            
            // 経験値を+1（試行回数増加時）
            gameState.experience++;
            localStorage.setItem('stoneGameExp', JSON.stringify(gameState.experience));
            
            // 崩壊処理
            collapseStones();
            
            // 天候メッセージ表示
            gameState.failureShake = 20;
            gameState.failureMessage = gameState.weather === 'rain' ? '雨が降った！' : '雪が降った！';
        }
        
        gameState.weather = null;
        gameState.particles = [];
    }, 3000);
}

// ガラガライベント発生チェック
function checkRumbleEvent() {
    // ガラガライベント発生確率をチェック
    if (Math.random() < gameState.rumbleEventChance) {
        // イベント発生！
        triggerRumbleEvent();
    }
}

// ガラガライベントを発生させる
function triggerRumbleEvent() {
    if (gameState.gameComplete || gameState.pyramid.length === 0) return;
    
    // 試行回数を+1（崩壊発生時）
    gameState.currentAttempt++;
    
    // 経験値を+1（試行回数増加時）
    gameState.experience++;
    localStorage.setItem('stoneGameExp', JSON.stringify(gameState.experience));
    
    // ガラガラ崩れる効果を表示
    gameState.failureShake = 20;
    gameState.failureMessage = 'ガラガラ...崩れた！';
    
    // すぐに確率ベースで崩壊
    collapseStones();
    
    // イベント発生確率をリセット（経験値×1%で確率低下）
    gameState.rumbleEventChance = 0.2 - (gameState.experience * 0.05);
    gameState.rumbleEventChance = Math.max(0, gameState.rumbleEventChance);
}

// 石を崩壊させる
function collapseStones() {
    // すべての石を崩壊させる（落下アニメーション付き）
    gameState.pyramid = gameState.pyramid
        .map(stone => ({
            ...stone,
            falling: {
                velocity: 0,
                startTime: Date.now()
            }
        }));
    
    // 落下完了後に石を完全に削除
    setTimeout(() => {
        gameState.pyramid = [];
    }, 2000);
}

// ゲーム完了
function completeGame() {
    if (gameState.pyramid.length < GAME_CONFIG.targetStones) {
        alert('まだ石が足りません！');
        return;
    }
    
    gameState.gameComplete = true;
    const elapsedTime = Math.floor((Date.now() - gameState.startTime) / 1000);
    
    // ゲーム完了時に経験値を+1
    gameState.experience += 1;
    localStorage.setItem('stoneGameExp', JSON.stringify(gameState.experience));
    
    // 結果を保存
    const result = {
        attempt: gameState.currentAttempt,
        time: elapsedTime,
        stoneCount: gameState.pyramid.length,
        shape: JSON.stringify(gameState.pyramid),
        timestamp: new Date().toISOString(),
        experience: gameState.experience // 完了時の経験値を記録
    };
    
    saveResult(result);
    showResult(result);
}

// 結果を保存 (ローカルストレージ - 7日間)
function saveResult(result) {
    const records = JSON.parse(localStorage.getItem('stoneGameRecords') || '[]');
    const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7日後
    
    records.push({
        ...result,
        expiry: expiryTime
    });
    
    // 期限切れを削除
    const validRecords = records.filter(r => r.expiry > Date.now());
    localStorage.setItem('stoneGameRecords', JSON.stringify(validRecords));
}

// 結果を表示
function showResult(result) {
    document.querySelector('.game-section').style.display = 'none';
    document.getElementById('resultSection').style.display = 'flex';
    
    document.getElementById('resultAttempts').textContent = result.attempt;
    document.getElementById('resultTime').textContent = result.time;
    
    // ピラミッドを描画
    drawPyramidPreview(JSON.parse(result.shape));
    
    // 前回の記録を表示
    showPreviousRecords();
}

// ピラミッドプレビューを描画
function drawPyramidPreview(pyramid) {
    const canvas = document.getElementById('pyramidCanvas');
    const ctx = canvas.getContext('2d');
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 背景
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#87ceeb');
    gradient.addColorStop(1, '#e0f6ff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 地面
    ctx.fillStyle = '#8b7355';
    ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
    
    // 石を描画
    const scale = 0.5;
    pyramid.forEach((stone) => {
        const startX = 50;
        const startY = 220;
        const stoneWidth = 80 * scale;
        const stoneHeight = 40 * scale;
        
        let x, y, width, height;
        
        if (stone.type === 'h') {
            width = stoneWidth * 2;
            height = stoneHeight;
            x = startX + stone.col * stoneWidth;
            y = startY - stone.row * stoneHeight;
        } else {
            width = stoneWidth;
            height = stoneHeight * 2;
            x = startX + stone.col * stoneWidth;
            y = startY - stone.row * stoneHeight - stoneHeight;
        }
        
        const stoneGradient = ctx.createLinearGradient(x, y, x, y + height);
        stoneGradient.addColorStop(0, '#9e9e9e');
        stoneGradient.addColorStop(0.3, '#757575');
        stoneGradient.addColorStop(0.7, '#616161');
        stoneGradient.addColorStop(1, '#424242');
        
        ctx.fillStyle = stoneGradient;
        
        // 岩のような角ばった形
        const offset = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + offset, y);
        ctx.lineTo(x + width - offset, y + offset);
        ctx.lineTo(x + width, y + height - offset);
        ctx.lineTo(x + width - offset, y + height);
        ctx.lineTo(x + offset, y + height - offset);
        ctx.lineTo(x, y + offset);
        ctx.closePath();
        ctx.fill();
        
        // 枠線
        ctx.strokeStyle = '#212121';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // ハイライト
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(x + offset, y);
        ctx.lineTo(x + width * 0.3, y);
        ctx.lineTo(x + width * 0.2, y + height * 0.3);
        ctx.lineTo(x + offset + 1, y + 1);
        ctx.closePath();
        ctx.fill();
    });
}

// 前回の記録を表示
function showPreviousRecords() {
    const records = JSON.parse(localStorage.getItem('stoneGameRecords') || '[]')
        .filter(r => r.expiry > Date.now())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5);
    
    const container = document.getElementById('previousRecords');
    
    if (records.length === 0) {
        container.innerHTML = '<p style="color: #999;">前回の記録はまだありません</p>';
        return;
    }
    
    let html = '';
    records.forEach((record, index) => {
        const date = new Date(record.timestamp);
        const timeStr = date.toLocaleString('ja-JP');
        const timeLeft = Math.floor((record.expiry - Date.now()) / (60 * 60 * 1000));
        
        html += `
            <div class="record-item">
                <strong>#${index + 1}: ${record.time}秒 (${record.attempt}回目)</strong>
                <div class="record-time">
                    記録: ${timeStr}<br>
                    あと${timeLeft}時間有効
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// 結果を共有
function shareResult() {
    const records = JSON.parse(localStorage.getItem('stoneGameRecords') || '[]')
        .filter(r => r.expiry > Date.now())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (records.length === 0) {
        alert('記録がありません');
        return;
    }
    
    const latestRecord = records[0];
    const pyramid = JSON.parse(latestRecord.shape);
    
    // URL生成
    const encoded = btoa(JSON.stringify({
        attempt: latestRecord.attempt,
        time: latestRecord.time,
        stoneCount: latestRecord.stoneCount,
        shape: pyramid
    }));
    
    const baseUrl = window.location.href.split('?')[0];
    const shareUrl = `${baseUrl}?result=${encoded}`;
    
    document.getElementById('shareUrl').style.display = 'flex';
    document.getElementById('shareInput').value = shareUrl;
}

// クリップボードにコピー
function copyToClipboard() {
    const input = document.getElementById('shareInput');
    input.select();
    document.execCommand('copy');
    alert('コピーしました!');
}

// リセット
function resetGame() {
    gameState.gameComplete = false;
    
    document.querySelector('.game-section').style.display = 'flex';
    document.getElementById('resultSection').style.display = 'none';
    
    initGame();
}

// 新しいゲーム開始
function newGame() {
    gameState.currentAttempt = 0; // 試行回数をリセット
    // 経験値とローカルストレージをリセット
    gameState.experience = 0;
    localStorage.removeItem('stoneGameExp');
    resetGame();
}

// タイマー表示
function updateTimer() {
    if (!gameState.startTime || gameState.gameComplete) return;
    
    const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
    document.getElementById('timer').textContent = elapsed;
    document.getElementById('attemptCount').textContent = gameState.currentAttempt;
}

// URLパラメータから結果を読み込む
function loadResultFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const resultData = params.get('result');
    
    if (resultData) {
        try {
            const decoded = JSON.parse(atob(resultData));
            gameState.pyramid = decoded.shape;
            gameState.gameComplete = true;
            gameState.startTime = null;
            
            document.querySelector('.game-section').style.display = 'none';
            document.getElementById('resultSection').style.display = 'flex';
            
            document.getElementById('resultAttempts').textContent = decoded.attempt;
            document.getElementById('resultTime').textContent = decoded.time;
            
            drawPyramidPreview(decoded.shape);
            showPreviousRecords();
        } catch (e) {
            console.error('結果の読み込みに失敗しました', e);
            initGame();
        }
    } else {
        initGame();
    }
}

// 初期化
window.addEventListener('DOMContentLoaded', () => {
    // 試行回数をリセット（ページロード時）
    gameState.currentAttempt = 0;
    
    loadResultFromUrl();
    initGame();
    
    // タイマーを1秒ごとに更新
    setInterval(updateTimer, 1000);
});