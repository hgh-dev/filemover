// 백엔드(Firebase 및 Cloudinary) 관련 모듈 임포트
import {
    auth, db, provider,
    signInWithPopup, onAuthStateChanged, signOut,
    collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, updateDoc,
    deleteCloudinaryFile
} from "./backend.js";

// PWA: 서비스 워커 등록
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .catch(err => console.log('Service Worker 등록 실패: ', err));
    });
}

// DOM 요소 
const loginScreen = document.getElementById('loginScreen');
const appContent = document.getElementById('appContent');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const profileBtn = document.getElementById('profileBtn');
const profilePopup = document.getElementById('profilePopup');
const popupName = document.getElementById('popupName');
const popupEmail = document.getElementById('popupEmail');
const popupProfilePic = document.getElementById('popupProfilePic');
const menuBtn = document.getElementById('menuBtn');
const tagSidebar = document.getElementById('tagSidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const mainAddBtn = document.getElementById('mainAddBtn');
const addMenuPopup = document.getElementById('addMenuPopup');
const menuAddMemo = document.getElementById('menuAddMemo');
const menuAddLink = document.getElementById('menuAddLink');
const menuAddPhoto = document.getElementById('menuAddPhoto');
const menuAddFile = document.getElementById('menuAddFile');
const appTitleBtn = document.getElementById('appTitleBtn');
const toggleSelectModeBtn = document.getElementById('toggleSelectModeBtn');
const selectionCountLabel = document.getElementById('selectionCountLabel');
const selectionActionBar = document.getElementById('selectionActionBar');
const selectionSummary = document.getElementById('selectionSummary');
const cancelSelectionBtn = document.getElementById('cancelSelectionBtn');
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');

const photoInput = document.getElementById('photoInput');
const generalFileInput = document.getElementById('generalFileInput');
const photoResizeModal = document.getElementById('photoResizeModal');
const resizeOption = document.getElementById('resizeOption');
const customWidthInput = document.getElementById('customWidth');
const cancelPhotoBtn = document.getElementById('cancelPhotoBtn');
const confirmPhotoBtn = document.getElementById('confirmPhotoBtn');
const dragDropHint = document.getElementById('dragDropHint');

const memoModal = document.getElementById('memoModal');
const memoTitleInput = document.getElementById('memoTitleInput');
const memoInput = document.getElementById('memoInput');
const saveMemoBtn = document.getElementById('saveMemoBtn');
const cancelMemoBtn = document.getElementById('cancelMemoBtn');

const linkModal = document.getElementById('linkModal');
const linkInput = document.getElementById('linkInput');
const saveLinkBtn = document.getElementById('saveLinkBtn');
const cancelLinkBtn = document.getElementById('cancelLinkBtn');

const multiDownloadModal = document.getElementById('multiDownloadModal');
const closeMultiDownloadBtn = document.getElementById('closeMultiDownloadBtn');
const multiDownloadList = document.getElementById('multiDownloadList');
const multiDownloadTitle = document.getElementById('multiDownloadTitle');

const TAG_META = {
    red: { label: '빨간색', color: '#ff3b30' },
    orange: { label: '주황색', color: '#ff9500' },
    yellow: { label: '노란색', color: '#ffcc00' },
    green: { label: '초록색', color: '#34c759' },
    blue: { label: '파란색', color: '#007aff' },
    navy: { label: '남색', color: '#3f51b5' },
    purple: { label: '보라색', color: '#af52de' },
    gray: { label: '회색', color: '#8e8e93' }
};
let currentFilter = 'all';
let currentTagFilter = 'none';
let isSelectionMode = false;
const selectedCardIds = new Set();
let pendingDropPayload = null;
let dragDepth = 0;

closeMultiDownloadBtn.addEventListener('click', () => multiDownloadModal.style.display = 'none');

function updateSelectionModeUI() {
    const selectedCount = selectedCardIds.size;
    if (toggleSelectModeBtn) toggleSelectModeBtn.classList.toggle('active', isSelectionMode);
    if (toggleSelectModeBtn) toggleSelectModeBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size: 14px;">checklist</span>${isSelectionMode ? '선택 중' : '선택'}`;
    if (selectionCountLabel) selectionCountLabel.innerText = isSelectionMode ? `${selectedCount}개 선택` : '';
    if (selectionSummary) selectionSummary.innerText = `${selectedCount}개 선택됨`;
    if (selectionActionBar) selectionActionBar.classList.toggle('active', isSelectionMode);
    if (mainAddBtn) mainAddBtn.style.display = isSelectionMode ? 'none' : 'flex';
    if (!isSelectionMode) addMenuPopup.style.display = 'none';
}

function syncCardSelectionStyles() {
    document.querySelectorAll('.list-card').forEach((card) => {
        const docId = card.dataset.id;
        const indicator = card.querySelector('.card-select-indicator');
        const selected = !!(docId && selectedCardIds.has(docId));
        card.classList.toggle('selection-mode', isSelectionMode);
        card.classList.toggle('selection-selected', selected);
        if (indicator) indicator.innerText = selected ? '✓' : '';
    });
}

function setSelectionMode(enabled) {
    isSelectionMode = enabled;
    if (!enabled) selectedCardIds.clear();
    updateSelectionModeUI();
    syncCardSelectionStyles();
}

function toggleCardSelected(docId) {
    if (!docId) return;
    if (selectedCardIds.has(docId)) selectedCardIds.delete(docId);
    else selectedCardIds.add(docId);
    updateSelectionModeUI();
    syncCardSelectionStyles();
}

async function deleteSelectedCards() {
    if (!auth.currentUser || selectedCardIds.size === 0) return;
    const selectedCount = selectedCardIds.size;
    if (!confirm(`선택한 ${selectedCount}개 카드를 삭제하시겠습니까?`)) return;

    const deleteOverlay = document.getElementById('deleteOverlay');
    if (deleteOverlay) deleteOverlay.classList.add('active');

    try {
        const uid = auth.currentUser.uid;
        const q = query(collection(db, 'cards'), where('uid', '==', uid));
        const snapshot = await getDocs(q);

        for (const d of snapshot.docs) {
            if (!selectedCardIds.has(d.id)) continue;
            const cardData = d.data();
            await updateDoc(doc(db, 'cards', d.id), { status: 'deleting' });
            await deleteCardCloudinaryFiles(cardData);
            await deleteDoc(doc(db, 'cards', d.id));
        }

        setSelectionMode(false);
        await loadUserData(uid);
        setTimeout(() => alert(`${selectedCount}개 카드가 삭제되었습니다.`), 100);
    } catch (error) {
        console.error('선택 카드 삭제 중 오류:', error);
        alert('선택 카드 삭제에 실패했습니다.');
    } finally {
        if (deleteOverlay) deleteOverlay.classList.remove('active');
    }
}

updateSelectionModeUI();

// 인증 상태 감지 및 UI 전환
onAuthStateChanged(auth, (user) => {
    if (user) {
        loginScreen.style.display = 'none';
        appContent.style.display = 'flex';

        const initial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
        const profileHtml = user.photoURL
            ? `<img src="${user.photoURL}" alt="profile" referrerpolicy="no-referrer">`
            : initial;

        profileBtn.innerHTML = profileHtml;
        popupProfilePic.innerHTML = profileHtml;
        popupName.innerText = user.displayName || '사용자';
        popupEmail.innerText = user.email || '';

        loadUserData(user.uid);
    } else {
        loginScreen.style.display = 'flex';
        appContent.style.display = 'none';
        document.getElementById('cardContainer').innerHTML = '';
        setSelectionMode(false);
        pendingDropPayload = null;
        dragDepth = 0;
        setDragDropHintVisible(false);
    }
});

// === 2차 방어: 고스트 카드 청소 (자가 치유) ===
async function performGhostDataCleanup(cardData, docId) {
    if (cardData.type === 'text') return 0;

    let urls = Array.isArray(cardData.content) ? cardData.content : [cardData.content];
    if (urls.length === 0) return 0;

    const targetUrl = urls[0];

    try {
        const response = await fetch(targetUrl, { method: 'HEAD' });

        if (response.status === 404) {
            console.log(`🧹 [고스트 청소 완료] 파일 없음 확인. 카드 삭제됨: ${cardData.name}`);
            await deleteDoc(doc(db, 'cards', docId));

            const cardEl = document.querySelector(`.list-card[data-id="${docId}"]`);
            if (cardEl) {
                cardEl.style.transition = 'opacity 0.4s ease, height 0.4s ease, padding 0.4s ease';
                cardEl.style.opacity = '0';
                cardEl.style.height = '0px';
                cardEl.style.padding = '0px';
                cardEl.style.overflow = 'hidden';
                setTimeout(() => cardEl.remove(), 400);
            }

            if (cardData.size) {
                totalUsedSpace -= (parseFloat(cardData.size) * 1024 * 1024);
                if (totalUsedSpace < 0) totalUsedSpace = 0;
                updateQuotaUI();
            }
            return 1;
        }
    } catch (error) {
        console.warn(`파일 검사 중 네트워크 오류 (무시됨): ${targetUrl}`);
    }

    return 0;
}

// 업로드된 파일의 형식(image/video/raw)을 URL 또는 파일 확장자로 파악하여 올바르게 삭제 요청하는 안전한 헬퍼 함수
async function deleteCardCloudinaryFiles(data) {
    if (data.type === 'text' || !data.publicIds) return;
    const urls = Array.isArray(data.content) ? data.content : [data.content];
    const pIds = Array.isArray(data.publicIds) ? data.publicIds : [data.publicIds];

    for (let i = 0; i < pIds.length; i++) {
        const pid = pIds[i];
        let url = urls[i];
        if (!url && typeof data.content === 'string') url = data.content;

        let rType = data.type === 'image' ? 'image' : 'raw';

        // 1. URL이 존재한다면 URL 경로의 타입(image/video/raw) 참조 (가장 정확함)
        if (url && typeof url === 'string') {
            if (url.includes('/image/upload/')) rType = 'image';
            else if (url.includes('/video/upload/')) rType = 'video';
            else if (url.includes('/raw/upload/')) rType = 'raw';
        }
        // 2. URL이 없다면 (업로드 중단 등) public_id에 기록해둔 확장자로 파일 추론
        else if (pid && typeof pid === 'string') {
            if (pid.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)) rType = 'image';
            else if (pid.match(/\.(mp4|mov|webm|avi|mkv)$/i)) rType = 'video';
        }

        await deleteCloudinaryFile(pid, rType);
    }
}

// === 1차 & 3차 방어 통합: 접속 시 일괄 청소 로직 ===
async function loadUserData(uid) {
    const container = document.getElementById('cardContainer');
    container.innerHTML = '';
    totalUsedSpace = 0;

    let expiredCount = 0;
    let expiredNames = [];
    let trashCleanedCount = 0; // 💡 업로드 중단된 파일 삭제 카운트

    try {
        const q = query(collection(db, "cards"), where("uid", "==", uid));
        const querySnapshot = await getDocs(q);
        const cardsToRender = [];
        const renderableIdSet = new Set();
        const now = new Date().getTime();

        for (const docSnap of querySnapshot.docs) {
            const cardData = docSnap.data();
            const docId = docSnap.id;
            const hasTag = !!(cardData.tagColor && TAG_META[cardData.tagColor]);

            if (hasTag) {
                cardData.expirationDays = 'permanent';
                cardData.originalDuration = 'permanent';
                if (docSnap.data().expirationDays !== 'permanent' || docSnap.data().originalDuration !== 'permanent') {
                    await updateDoc(doc(db, 'cards', docId), { expirationDays: 'permanent', originalDuration: 'permanent' });
                }
            } else if (cardData.expirationDays === 'permanent') {
                cardData.expirationDays = 3;
                cardData.originalDuration = 3;
                await updateDoc(doc(db, 'cards', docId), { expirationDays: 3, originalDuration: 3 });
            }

            // ★★★ [3차 방어] 업로드/삭제 중단된 찌꺼기 파일 청소 ★★★
            if (cardData.status === 'uploading' || cardData.status === 'deleting') {
                console.log(`🧹 [비정상 카드 청소] 비정상 상태(${cardData.status}) 발견. 삭제 진행...`);
                // 클라우드에 중간까지 올라간 파일이 있다면 모두 삭제
                await deleteCardCloudinaryFiles(cardData);
                // 불완전한 DB 카드 파기
                await deleteDoc(doc(db, 'cards', docId));
                trashCleanedCount++;
                continue; // 화면에 그리지 않고 다음 카드로 패스
            }

            // 1차 방어 (만료된 카드 청소)
            let isExpired = false;
            if (cardData.expirationDays !== 'permanent') {
                const expireTime = cardData.uploadTime + (cardData.expirationDays * 24 * 60 * 60 * 1000);
                if (now > expireTime) {
                    isExpired = true;
                }
            }

            if (isExpired) {
                console.log(`🧨 [자동 폭파] 기간 만료 카드: ${cardData.name}`);
                await deleteCardCloudinaryFiles(cardData);
                await deleteDoc(doc(db, 'cards', docId));

                expiredCount++;
                if (expiredNames.length < 2) expiredNames.push(cardData.name || '이름 없음');
            } else {
                cardsToRender.push({ id: docId, ...cardData });
                renderableIdSet.add(docId);
            }
        }

        selectedCardIds.forEach((id) => {
            if (!renderableIdSet.has(id)) selectedCardIds.delete(id);
        });

        cardsToRender.sort((a, b) => a.uploadTime - b.uploadTime);
        const ghostCleanupPromises = [];

        cardsToRender.forEach(cardData => {
            createCard(cardData, cardData.id);
            if (cardData.size) {
                totalUsedSpace += (parseFloat(cardData.size) * 1024 * 1024);
            }
            ghostCleanupPromises.push(performGhostDataCleanup(cardData, cardData.id));
        });
        updateQuotaUI();
        updateSelectionModeUI();
        syncCardSelectionStyles();

        // 1. 기간 만료 알림
        if (expiredCount > 0) {
            let alertMsg = `기간이 만료되어 ${expiredCount}개의 카드 및 그 데이터가 자동 삭제되었습니다.\n`;
            alertMsg += expiredCount === 1 ? `(삭제된 항목: ${expiredNames[0]})` : `(삭제된 항목: ${expiredNames.join(', ')} 외)`;
            setTimeout(() => alert(alertMsg), 300);
        }

        // 2. 비정상 작업 중단 파일 청소 알림
        if (trashCleanedCount > 0) {
            setTimeout(() => alert(`이전에 비정상 중단되었던 작업(업로드/삭제)이 ${trashCleanedCount}건 존재하여 연관된 데이터가 서버에서 자동 정리되었습니다.`), 600);
        }

        // 3. 고스트 카드 알림
        Promise.all(ghostCleanupPromises).then(results => {
            const ghostDeletedCount = results.reduce((sum, current) => sum + current, 0);
            if (ghostDeletedCount > 0) {
                setTimeout(() => alert(`서버에 데이터가 존재하지 않아 ${ghostDeletedCount}건의 카드가 삭제되었습니다.`), 900);
            }
        });

    } catch (error) {
        console.error("데이터 로드 중 오류 발생:", error);
    }
}

// UI 이벤트 리스너들
loginBtn.addEventListener('click', () => signInWithPopup(auth, provider).catch(error => alert("로그인에 실패했습니다.")));
logoutBtn.addEventListener('click', () => signOut(auth));
if (toggleSelectModeBtn) {
    toggleSelectModeBtn.addEventListener('click', () => {
        setSelectionMode(!isSelectionMode);
    });
}
if (cancelSelectionBtn) cancelSelectionBtn.addEventListener('click', () => setSelectionMode(false));
if (deleteSelectedBtn) deleteSelectedBtn.addEventListener('click', () => deleteSelectedCards());

function setTagSidebarOpen(isOpen) {
    if (!tagSidebar || !sidebarOverlay) return;
    tagSidebar.classList.toggle('open', isOpen);
    sidebarOverlay.classList.toggle('active', isOpen);
}

function closeAllTagPickers() {
    document.querySelectorAll('.tag-picker.open').forEach((picker) => picker.classList.remove('open'));
}

profileBtn.addEventListener('click', (e) => { e.stopPropagation(); profilePopup.style.display = profilePopup.style.display === 'none' ? 'flex' : 'none'; });
menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const shouldOpen = !tagSidebar.classList.contains('open');
    setTagSidebarOpen(shouldOpen);
});
if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => setTagSidebarOpen(false));
mainAddBtn.addEventListener('click', (e) => { e.stopPropagation(); addMenuPopup.style.display = addMenuPopup.style.display === 'none' ? 'flex' : 'none'; });
document.addEventListener('click', (e) => {
    if (profilePopup && !profilePopup.contains(e.target) && !profileBtn.contains(e.target)) profilePopup.style.display = 'none';
    if (addMenuPopup && !addMenuPopup.contains(e.target) && !mainAddBtn.contains(e.target)) addMenuPopup.style.display = 'none';
    if (tagSidebar && !tagSidebar.contains(e.target) && !menuBtn.contains(e.target)) setTagSidebarOpen(false);
    closeAllTagPickers();
});

menuAddMemo.addEventListener('click', () => { addMenuPopup.style.display = 'none'; memoInput.value = ''; memoModal.style.display = 'flex'; });
menuAddLink.addEventListener('click', () => { addMenuPopup.style.display = 'none'; linkInput.value = ''; linkModal.style.display = 'flex'; });
menuAddPhoto.addEventListener('click', () => { addMenuPopup.style.display = 'none'; photoResizeModal.style.display = 'flex'; });
resizeOption.addEventListener('change', function () { customWidthInput.style.display = this.value === 'custom' ? 'inline-block' : 'none'; });
cancelPhotoBtn.addEventListener('click', () => {
    photoResizeModal.style.display = 'none';
    pendingDropPayload = null;
});
confirmPhotoBtn.addEventListener('click', async () => {
    photoResizeModal.style.display = 'none';
    if (pendingDropPayload) {
        const payload = pendingDropPayload;
        pendingDropPayload = null;
        await runDroppedUpload(payload);
        return;
    }
    photoInput.click();
});
menuAddFile.addEventListener('click', () => { addMenuPopup.style.display = 'none'; generalFileInput.click(); });
cancelMemoBtn.addEventListener('click', () => memoModal.style.display = 'none');
cancelLinkBtn.addEventListener('click', () => linkModal.style.display = 'none');

window.addEventListener('dragenter', (event) => {
    if (!eventHasFiles(event)) return;
    event.preventDefault();
    if (!auth.currentUser) return;
    dragDepth += 1;
    setDragDropHintVisible(true);
});

window.addEventListener('dragover', (event) => {
    if (!eventHasFiles(event)) return;
    event.preventDefault();
    if (!auth.currentUser) return;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    setDragDropHintVisible(true);
});

window.addEventListener('dragleave', (event) => {
    if (!auth.currentUser) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) setDragDropHintVisible(false);
});

window.addEventListener('drop', async (event) => {
    if (!eventHasFiles(event)) return;
    event.preventDefault();
    if (!auth.currentUser) return;
    dragDepth = 0;
    setDragDropHintVisible(false);

    const droppedFiles = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
    if (droppedFiles.length === 0) return;

    const { imageFiles, generalFiles } = splitDroppedFiles(droppedFiles);
    if (imageFiles.length > 0) {
        pendingDropPayload = { imageFiles, generalFiles };
        photoResizeModal.style.display = 'flex';
        return;
    }
    await runDroppedUpload({ imageFiles: [], generalFiles });
});

saveMemoBtn.addEventListener('click', async () => {
    const title = memoTitleInput.value.trim();
    const text = memoInput.value.trim();
    if (!text || !auth.currentUser) return;
    saveMemoBtn.disabled = true;

    const cardData = { uid: auth.currentUser.uid, type: 'text', name: title || '제목없음', content: text, expirationDays: 3, originalDuration: 3, uploadTime: new Date().getTime(), status: 'complete' };
    try {
        const docRef = await addDoc(collection(db, "cards"), cardData);
        createCard(cardData, docRef.id);
        memoModal.style.display = 'none'; memoTitleInput.value = ''; memoInput.value = '';
    } catch (error) { console.error("메모 저장 실패:", error); }
    finally { saveMemoBtn.disabled = false; }
});

saveLinkBtn.addEventListener('click', async () => {
    let link = linkInput.value.trim();
    if (!link || !auth.currentUser) return;

    if (!/^https?:\/\//i.test(link)) {
        link = 'http://' + link;
    }

    saveLinkBtn.disabled = true;
    const originalText = saveLinkBtn.innerText;
    saveLinkBtn.innerText = '제목 찾는 중...';

    let fetchedTitle = link;
    try {
        const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(link)}`);
        if (response.ok) {
            const data = await response.json();
            const html = data.contents;
            if (html) {
                const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (titleMatch && titleMatch[1]) {
                    fetchedTitle = titleMatch[1].trim();
                    const decoder = document.createElement('div');
                    decoder.innerHTML = fetchedTitle;
                    fetchedTitle = decoder.textContent;
                }
            }
        }
    } catch (e) {
        console.warn("링크 타이틀 가져오기 실패:", e);
    }

    const cardData = { uid: auth.currentUser.uid, type: 'text', content: link, name: fetchedTitle, expirationDays: 3, originalDuration: 3, uploadTime: new Date().getTime(), status: 'complete' };
    try {
        const docRef = await addDoc(collection(db, "cards"), cardData);
        createCard(cardData, docRef.id);
        linkModal.style.display = 'none'; linkInput.value = '';
    } catch (error) { console.error("링크 저장 실패:", error); }
    finally { 
        saveLinkBtn.disabled = false;
        saveLinkBtn.innerText = originalText;
    }
});



let totalUsedSpace = 0;

function formatTimestampForFilename(timestamp) {
    const date = Number.isFinite(timestamp) ? new Date(timestamp) : new Date();
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const pad = (n) => String(n).padStart(2, '0');
    return `${safeDate.getFullYear()}${pad(safeDate.getMonth() + 1)}${pad(safeDate.getDate())}_${pad(safeDate.getHours())}${pad(safeDate.getMinutes())}${pad(safeDate.getSeconds())}`;
}

function getFileExtension(file) {
    if (file && typeof file.name === 'string') {
        const dotIdx = file.name.lastIndexOf('.');
        if (dotIdx !== -1 && dotIdx < file.name.length - 1) return file.name.substring(dotIdx).toLowerCase();
    }

    const mime = (file && typeof file.type === 'string') ? file.type.toLowerCase() : '';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';
    if (mime === 'image/png') return '.png';
    if (mime === 'image/webp') return '.webp';
    if (mime === 'image/gif') return '.gif';
    if (mime === 'image/heic') return '.heic';
    if (mime === 'image/heif') return '.heif';
    if (mime === 'image/bmp') return '.bmp';
    if (mime === 'image/svg+xml') return '.svg';
    return '';
}

function buildPhotoUploadFilename(file, sourceTimestamp, wasResized) {
    const ts = Number.isFinite(sourceTimestamp) ? sourceTimestamp : (file && Number.isFinite(file.lastModified) ? file.lastModified : Date.now());
    const datePart = formatTimestampForFilename(ts);
    const ext = getFileExtension(file);
    return `${wasResized ? 'resize_' : ''}${datePart}${ext}`;
}

function setDragDropHintVisible(visible) {
    if (!dragDropHint) return;
    dragDropHint.classList.toggle('active', visible);
}

function eventHasFiles(event) {
    const types = event.dataTransfer && event.dataTransfer.types ? Array.from(event.dataTransfer.types) : [];
    return types.includes('Files');
}

function isLikelyImageFile(file) {
    if (!file) return false;
    if (typeof file.type === 'string' && file.type.startsWith('image/')) return true;
    const name = typeof file.name === 'string' ? file.name.toLowerCase() : '';
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic|heif|avif)$/i.test(name);
}

function splitDroppedFiles(files) {
    const imageFiles = [];
    const generalFiles = [];
    files.forEach((file) => {
        if (isLikelyImageFile(file)) imageFiles.push(file);
        else generalFiles.push(file);
    });
    return { imageFiles, generalFiles };
}

async function runDroppedUpload(payload) {
    if (!payload || !auth.currentUser) return;
    const imageFiles = payload.imageFiles || [];
    const generalFiles = payload.generalFiles || [];

    if (imageFiles.length > 0) {
        await handleFilesUpload(imageFiles, 'image');
    }
    if (generalFiles.length > 0) {
        await handleFilesUpload(generalFiles, 'file');
    }
}

// ★★★ 업로드 핵심 로직 (빈 카드 선발행 & 올바른 폴더/이름 적용) ★★★
async function handleFilesUpload(files, type) {
    if (!files || files.length === 0) return;

    let fileArray = Array.from(files);
    let isImageGroup = type === 'image';
    const imageMetaList = [];

    const overlay = document.getElementById('uploadOverlay');
    const overlayFilename = document.getElementById('uploadFilename');
    const overlayBar = document.getElementById('uploadProgressBar');
    const overlayPct = document.getElementById('uploadProgressPct');
    const overlayCount = document.getElementById('uploadCountLabel');
    overlay.classList.add('active');
    overlayFilename.innerText = "처리 중...";

    if (isImageGroup) {
        for (let i = 0; i < fileArray.length; i++) {
            const resizeResult = await resizeImage(fileArray[i]);
            fileArray[i] = resizeResult.file;
            imageMetaList[i] = {
                wasResized: resizeResult.wasResized,
                sourceTimestamp: resizeResult.sourceTimestamp
            };
        }
    }

    let totalNewSize = 0;
    for (let file of fileArray) totalNewSize += file.size;

    const uploadTimestamp = new Date().getTime();
    const uid = auth.currentUser.uid;

    const expirationDays = 3;

    let docRef;
    try {
        // [1] status: 'uploading' 꼬리표를 단 빈 카드를 미리 생성합니다.
        docRef = await addDoc(collection(db, "cards"), {
            uid: uid,
            type: isImageGroup ? 'image' : 'file',
            content: [],
            originalNames: [],
            publicIds: [],
            name: "업로드 진행 중...",
            size: "0.00",
            expirationDays: expirationDays,
            originalDuration: expirationDays,
            uploadTime: uploadTimestamp,
            fileCount: 0,
            status: 'uploading'
        });
    } catch (e) {
        console.error("임시 문서 생성 에러: ", e);
        alert("업로드 준비 중 오류가 발생했습니다.");
        overlay.classList.remove('active');
        return;
    }

    let fileUrls = [];
    let originalNamesList = [];
    let publicIdsList = [];
    let sizesList = [];
    let groupSize = 0;

    let isUploadCancelled = false;
    let currentXhr = null;
    const cancelUploadBtn = document.getElementById('cancelUploadBtn');
    if (cancelUploadBtn) {
        cancelUploadBtn.onclick = () => {
            if (confirm("현재 업로드를 완전히 취소하시겠습니까?")) {
                isUploadCancelled = true;
                if (currentXhr) currentXhr.abort();
            }
        };
    }

    for (let i = 0; i < fileArray.length; i++) {
        let file = fileArray[i];
        let finalFileName = file.name;
        if (isImageGroup) {
            const imageMeta = imageMetaList[i] || {};
            finalFileName = buildPhotoUploadFilename(file, imageMeta.sourceTimestamp, imageMeta.wasResized);
        }

        originalNamesList.push(finalFileName);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'filemover');

        // ★★★ [폴더 지정 핵심 부분] ★★★
        // 1. 파일 이름에서 확장자를 뺀 순수 이름만 추출해 (예: image.png -> image)
        const nameBase = finalFileName.substring(0, finalFileName.lastIndexOf('.')) || finalFileName;
        // 2. public_id에서는 uid 경로를 삭제하고 순수 파일명+시간값만 남겨
        const newPublicId = `${nameBase}_${uploadTimestamp}_${i}`;
        formData.append('public_id', newPublicId);
        // 3. ★ 핵심: folder 라는 라벨을 새로 만들어서 uid(사용자 고유번호) 폴더에 담으라고 명시해
        formData.append('folder', uid);

        const cloudName = 'dxcfrulyd';
        overlayFilename.innerText = finalFileName;
        overlayBar.style.width = '0%'; overlayPct.innerText = '0%';
        overlayCount.innerText = fileArray.length > 1 ? `파일 ${i + 1} / ${fileArray.length}` : '';

        // ★ [수정] 업로드 중단 시 찌꺼기 파일 삭제를 위해 업로드 전 public_id 미리 기록
        // 일반 파일(raw 타입)인 경우 Cloudinary가 원본 파일의 확장자를 public_id 끝에 강제로 붙이므로 그 형식을 똑같이 맞춰줌
        const dotIndex = finalFileName.lastIndexOf('.');
        const ext = dotIndex !== -1 ? finalFileName.substring(dotIndex) : '';
        const expectedPublicId = isImageGroup ? `${uid}/${newPublicId}` : `${uid}/${newPublicId}${ext}`;

        publicIdsList.push(expectedPublicId);
        await updateDoc(doc(db, 'cards', docRef.id), { publicIds: publicIdsList });

        if (isUploadCancelled) break;

        try {
            const data = await new Promise((resolve, reject) => {
                currentXhr = new XMLHttpRequest();
                currentXhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const pct = Math.round((event.loaded / event.total) * 100);
                        overlayBar.style.width = pct + '%'; overlayPct.innerText = pct + '%';
                    }
                };
                currentXhr.onload = () => {
                    if (currentXhr.status >= 200 && currentXhr.status < 300) resolve(JSON.parse(currentXhr.responseText));
                    else reject(new Error(`HTTP 오류: ${currentXhr.status}`));
                };
                currentXhr.onerror = () => reject(new Error('네트워크 오류'));
                currentXhr.onabort = () => reject(new Error('Upload Cancelled'));
                currentXhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);
                currentXhr.send(formData);
            });

            if (data.secure_url) {
                totalUsedSpace += file.size;
                groupSize += file.size;
                fileUrls.push(data.secure_url);
                sizesList.push(file.size);

                // 만약 예측한 확장자와 다를 경우를 대비하여, 업로드 성공 시 배열 안의 값을 Cloudinary가 확정한 진짜 public_id로 교체
                publicIdsList[publicIdsList.length - 1] = data.public_id;
            } else {
                alert(`${finalFileName} 업로드에 실패했습니다.`);
            }
        } catch (error) {
            if (isUploadCancelled) {
                console.log("업로드 사용자에 의해 중단됨:", finalFileName);
                break;
            }
            console.error("파일 업로드 에러:", error);
            alert(`${finalFileName} 전송에 실패했습니다.`);
        }
    }

    overlay.classList.remove('active');

    if (isUploadCancelled) {
        alert("업로드가 취소되었습니다. 취소된 데이터가 서버에서 정리됩니다.");
        await deleteCardCloudinaryFiles({ type: isImageGroup ? 'image' : 'file', publicIds: publicIdsList });
        await deleteDoc(doc(db, 'cards', docRef.id));
        return;
    }

    // [3] 모든 업로드가 끝난 후, 카드를 '완료(complete)' 상태로 최종 저장
    if (fileUrls.length > 0) {
        updateQuotaUI();
        const finalSizeMB = (groupSize / (1024 * 1024)).toFixed(2);
        let finalCardName = fileArray.length > 1 ? `${originalNamesList[0]} 외 ${originalNamesList.length - 1}건` : originalNamesList[0];

        const finalCardData = {
            uid: uid,
            type: isImageGroup ? 'image' : 'file',
            content: fileUrls.length === 1 ? fileUrls[0] : fileUrls,
            originalNames: originalNamesList.length === 1 ? originalNamesList[0] : originalNamesList,
            publicIds: publicIdsList.length === 1 ? publicIdsList[0] : publicIdsList,
            sizes: sizesList.length === 1 ? sizesList[0] : sizesList,
            name: finalCardName,
            size: finalSizeMB,
            expirationDays: expirationDays,
            originalDuration: expirationDays,
            uploadTime: new Date().getTime(),
            fileCount: fileUrls.length,
            status: 'complete' // ★ 정상 완료 태그
        };

        await updateDoc(doc(db, 'cards', docRef.id), finalCardData);
        createCard(finalCardData, docRef.id);
    } else {
        await deleteDoc(doc(db, 'cards', docRef.id));
    }
}

function resizeImage(file) {
    return new Promise((resolve) => {
        const option = resizeOption.value;
        const sourceTimestamp = Number.isFinite(file.lastModified) ? file.lastModified : Date.now();
        if (option === 'original') {
            resolve({ file, wasResized: false, sourceTimestamp });
            return;
        }

        let targetWidth = option === 'custom' ? parseInt(customWidthInput.value) : parseInt(option);
        if (!targetWidth || isNaN(targetWidth)) targetWidth = 860;

        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            if (img.width <= targetWidth) {
                resolve({ file, wasResized: false, sourceTimestamp });
                return;
            }
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const ratio = targetWidth / img.width;
            canvas.width = targetWidth;
            canvas.height = img.height * ratio;

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (!blob) {
                    resolve({ file, wasResized: false, sourceTimestamp });
                    return;
                }
                resolve({
                    file: new File([blob], file.name, {
                        type: file.type,
                        lastModified: sourceTimestamp
                    }),
                    wasResized: true,
                    sourceTimestamp
                });
            }, file.type, 0.9);
        };
    });
}

photoInput.addEventListener('change', (e) => { handleFilesUpload(e.target.files, 'image'); photoInput.value = ''; });
generalFileInput.addEventListener('change', (e) => { handleFilesUpload(e.target.files, 'file'); generalFileInput.value = ''; });

function updateQuotaUI() { document.getElementById('quotaInfo').innerText = `현재 업로드 총 용량: ${(totalUsedSpace / (1024 * 1024)).toFixed(2)} MB`; }

document.getElementById('resetAllBtn').addEventListener('click', async () => {
    if (!auth.currentUser) return;
    if (!confirm('모든 카드를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;

    const deleteOverlay = document.getElementById('deleteOverlay');
    if (deleteOverlay) deleteOverlay.classList.add('active');

    const uid = auth.currentUser.uid;
    try {
        const q = query(collection(db, 'cards'), where('uid', '==', uid));
        const snapshot = await getDocs(q);

        for (const d of snapshot.docs) {
            const cardData = d.data();
            await deleteCardCloudinaryFiles(cardData);
            await deleteDoc(doc(db, 'cards', d.id));
        }

        document.getElementById('cardContainer').innerHTML = '';
        totalUsedSpace = 0;
        updateQuotaUI();
        setSelectionMode(false);

        setTimeout(() => alert('모든 카드가 완전히 삭제/초기화 되었습니다.'), 100);
    } catch (error) {
        console.error('전체 삭제 중 오류 발생:', error);
        alert('초기화에 실패했습니다.');
    } finally {
        if (deleteOverlay) deleteOverlay.classList.remove('active');
    }
});

function updateTagFilterUI() {
    document.querySelectorAll('.tag-filter-item').forEach((item) => {
        item.classList.toggle('active', item.dataset.tagFilter === currentTagFilter);
    });
}

document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active'); currentFilter = chip.dataset.filter; applyFilter(currentFilter);
    });
});

document.querySelectorAll('.tag-filter-item').forEach((item) => {
    item.addEventListener('click', () => {
        const selectedFilter = item.dataset.tagFilter || 'none';
        currentTagFilter = currentTagFilter === selectedFilter ? 'none' : selectedFilter;
        updateTagFilterUI();
        applyFilter(currentFilter);
        setTagSidebarOpen(false);
    });
});
updateTagFilterUI();

function applyFilter(filter) {
    if (filter) currentFilter = filter;
    const cards = document.querySelectorAll('.list-card');
    cards.forEach(card => {
        const typeMatched =
            currentFilter === 'all' ||
            (currentFilter === 'text' && card.dataset.cardType === 'memo') ||
            (currentFilter === 'link' && card.dataset.cardType === 'link') ||
            (currentFilter === 'image' && card.dataset.cardType === 'image') ||
            (currentFilter === 'file' && card.dataset.cardType === 'file');

        const tagColor = card.dataset.tagColor || '';
        const tagMatched =
            currentTagFilter === 'none' ? true :
            currentTagFilter === 'all' ? !!tagColor :
            tagColor === currentTagFilter;

        card.style.display = typeMatched && tagMatched ? '' : 'none';
    });
}

function formatDate(timestamp) {
    const d = new Date(timestamp); const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function forceDownload(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        let downloadName = filename || url.split('/').pop() || 'download_file';
        a.download = downloadName;
        document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(blobUrl); a.remove();
    } catch (error) { console.error('다운로드 오류:', error); window.open(url, '_blank'); }
}

function createCard(data, docId = null) {
    const container = document.getElementById('cardContainer');
    const card = document.createElement('div'); card.className = 'list-card';
    if (docId) card.dataset.id = docId;
    const tagKey = data.tagColor && TAG_META[data.tagColor] ? data.tagColor : '';
    card.dataset.tagColor = tagKey;
    const selectIndicator = document.createElement('span');
    selectIndicator.className = 'card-select-indicator';
    card.appendChild(selectIndicator);

    let badgeClass = 'badge-file'; let badgeText = 'FILE';
    if (data.type === 'text') {
        if (data.content.startsWith('http')) { badgeClass = 'badge-link'; badgeText = 'WEB'; card.dataset.cardType = 'link'; }
        else { badgeClass = 'badge-memo'; badgeText = 'MEMO'; card.dataset.cardType = 'memo'; }
    } else if (data.type === 'image') { badgeClass = 'badge-photo'; badgeText = 'PHOTO'; card.dataset.cardType = 'image'; }
    else { card.dataset.cardType = 'file'; }

    let titleText = data.name || '제목 없음'; let descText = ''; let svgIcon = '';
    if (data.type === 'text') {
        svgIcon = data.content.startsWith('http') ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#58b2c2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>' : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e2a849" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
        if (!data.name) titleText = badgeText === 'WEB' ? data.content : data.content.substring(0, 30) + (data.content.length > 30 ? '...' : '');
        descText = data.content;
    } else if (data.type === 'image') {
        svgIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e55c91" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
        descText = `용량: ${data.size}MB${data.fileCount && data.fileCount > 1 ? ` (총 ${data.fileCount}건)` : ''}`;
    } else {
        svgIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6a5bbd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>';
        descText = `용량: ${data.size}MB${data.fileCount && data.fileCount > 1 ? ` (총 ${data.fileCount}건)` : ''}`;
    }

    const dateStr = formatDate(data.uploadTime);
    const topRow = document.createElement('div'); topRow.className = 'card-top-row';
    const badgeEl = document.createElement('span'); badgeEl.className = `card-badge ${badgeClass}`; badgeEl.innerText = badgeText;
    const tagPickerItems = Object.entries(TAG_META).map(([key, meta]) => `
        <button class="tag-picker-item" data-tag-color="${key}">
            <span class="tag-picker-dot" style="background:${meta.color};"></span>${meta.label}
        </button>
    `).join('');

    const moreBtnWrap = document.createElement('div'); moreBtnWrap.style.position = 'relative';
    moreBtnWrap.style.display = 'flex';
    moreBtnWrap.style.gap = '4px';
    moreBtnWrap.innerHTML = `
        <button class="action-icon-btn tag-action-btn" style="color:#6f42c1; padding: 4px; border:none; background:transparent; cursor:pointer;" title="태그 지정">
            <span class="material-symbols-outlined" style="font-size: 20px;">label</span>
        </button>
        <button class="action-icon-btn edit-action-btn" style="color:#007bff; padding: 4px; border:none; background:transparent; cursor:pointer;" title="카드 제목 수정">
            <span class="material-symbols-outlined" style="font-size: 20px;">edit</span>
        </button>
        <button class="action-icon-btn delete-action-btn" style="color:#dc3545; padding: 4px; border:none; background:transparent; cursor:pointer;" title="카드 삭제">
            <span class="material-symbols-outlined" style="font-size: 20px;">delete</span>
        </button>
        <div class="tag-picker">
            ${tagPickerItems}
            <button class="tag-picker-item" data-tag-color="">태그 해제</button>
        </div>
    `;

    topRow.appendChild(badgeEl); topRow.appendChild(moreBtnWrap); card.appendChild(topRow);
    const bodyDiv = document.createElement('div'); bodyDiv.className = 'card-body';

    bodyDiv.innerHTML = `
        <div style="display: flex; gap: 12px; align-items: flex-start; margin-bottom: 4px;">
            <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: #f8f9fa; border-radius: 8px;">${svgIcon}</div>
            <div style="flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; justify-content: center;">
                <h4 class="card-title" style="margin: 0 0 4px 0;">${titleText}</h4>
                <p class="card-desc desc-clamp" style="margin: 0;">${descText}</p>
            </div>
        </div>
        <span class="card-date">${dateStr}</span>
        <div class="card-status-container" style="display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 2px;"><div class="card-status"></div></div>
    `;
    card.appendChild(bodyDiv);

    const titleEl = bodyDiv.querySelector('.card-title'); titleEl.style.cursor = 'pointer';
    titleEl.title = data.type === 'text' && badgeText !== 'WEB' ? '클릭하여 메모 보기' : '클릭하여 열기 및 다운로드';
    titleEl.addEventListener('click', (e) => {
        if (isSelectionMode && docId) {
            e.stopPropagation();
            toggleCardSelected(docId);
            return;
        }
        if (data.type === 'text') {
            if (badgeText === 'WEB') { let url = data.content; if (!url.match(/^https?:\/\//i)) url = 'http://' + url; window.open(url, '_blank'); }
            else { showMemoViewModal(data, docId); }
        } else {
            let modalData = data;
            if (!Array.isArray(data.content)) modalData = { ...data, content: [data.content], originalNames: [data.originalNames || data.name || '파일'], fileCount: 1 };
            showMultiDownloadModal(modalData, badgeText);
        }
    });

    const deleteBtn = moreBtnWrap.querySelector('.delete-action-btn');
    const editBtn = moreBtnWrap.querySelector('.edit-action-btn');
    const tagBtn = moreBtnWrap.querySelector('.tag-action-btn');
    const tagPicker = moreBtnWrap.querySelector('.tag-picker');

    tagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isSelectionMode) return;
        const willOpen = !tagPicker.classList.contains('open');
        closeAllTagPickers();
        if (willOpen) tagPicker.classList.add('open');
    });

    tagPicker.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (isSelectionMode) return;
        const target = e.target.closest('.tag-picker-item');
        if (!target || !docId) return;
        const selectedTag = target.dataset.tagColor || null;
        const nextTag = selectedTag && TAG_META[selectedTag] ? selectedTag : null;

        try {
            if (nextTag) {
                await updateDoc(doc(db, 'cards', docId), {
                    tagColor: nextTag,
                    expirationDays: 'permanent',
                    originalDuration: 'permanent'
                });
            } else {
                await updateDoc(doc(db, 'cards', docId), { tagColor: null });
            }
            closeAllTagPickers();
            if (auth.currentUser) await loadUserData(auth.currentUser.uid);
        } catch (err) {
            console.error('태그 저장 오류:', err);
            alert('태그 저장에 실패했습니다.');
        }
    });

    editBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (isSelectionMode) return;
        const currentTitle = data.name || titleText || '';
        const newTitle = prompt('수정할 카드 제목을 입력하세요:', currentTitle);
        if (newTitle !== null && newTitle.trim() !== '' && newTitle.trim() !== currentTitle) {
            try {
                if (docId) await updateDoc(doc(db, 'cards', docId), { name: newTitle.trim() });
                data.name = newTitle.trim();
                titleEl.innerText = newTitle.trim();
            } catch (err) {
                console.error('제목 수정 오류:', err);
                alert('제목 수정에 실패했습니다.');
            }
        }
    });

    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (isSelectionMode) return;
        if (!confirm('정말 이 카드를 삭제하시겠습니까?')) return;

        const deleteOverlay = document.getElementById('deleteOverlay');
        if (deleteOverlay) deleteOverlay.classList.add('active');

        try {
            // ★ [수정] 네트워크 단절/앱 강제 종료 대비 상태를 'deleting'으로 꼬리표 붙임
            if (docId) await updateDoc(doc(db, 'cards', docId), { status: 'deleting' });

            await deleteCardCloudinaryFiles(data);
            if (docId) await deleteDoc(doc(db, 'cards', docId));
            if (data.type !== 'text' && data.size) {
                totalUsedSpace -= (parseFloat(data.size) * 1024 * 1024);
                if (totalUsedSpace < 0) totalUsedSpace = 0; updateQuotaUI();
            }
            if (docId && selectedCardIds.has(docId)) selectedCardIds.delete(docId);
            updateSelectionModeUI();
            card.remove();

            setTimeout(() => alert(`데이터가 완전히 삭제되었습니다.`), 100);
        } catch (error) {
            console.error('삭제 중 오류 발생:', error);
            alert('데이터 삭제에 실패했습니다.');
        } finally {
            if (deleteOverlay) deleteOverlay.classList.remove('active');
        }
    });

    const statusContainer = bodyDiv.querySelector('.card-status-container');
    const statusDiv = statusContainer.querySelector('.card-status');
    const extendBtn = document.createElement('button'); extendBtn.className = 'extend-btn'; extendBtn.innerText = '연장'; extendBtn.style.display = 'none';
    statusContainer.appendChild(extendBtn);
    if (tagKey) {
        const tagDot = document.createElement('span');
        tagDot.className = 'card-tag-dot';
        tagDot.style.backgroundColor = TAG_META[tagKey].color;
        card.appendChild(tagDot);
    }

    card.addEventListener('click', () => {
        if (!isSelectionMode || !docId) return;
        toggleCardSelected(docId);
    });

    container.insertBefore(card, container.firstChild);
    if ((typeof currentFilter !== 'undefined' && currentFilter !== 'all') || currentTagFilter !== 'none') applyFilter(currentFilter);
    syncCardSelectionStyles();

    setTimeout(() => {
        const descEl = bodyDiv.querySelector('.card-desc');
        if (descEl && descEl.scrollHeight > descEl.clientHeight) {
            const toggleBtn = document.createElement('button'); toggleBtn.className = 'toggle-desc-btn'; toggleBtn.innerText = '자세히 보기';
            toggleBtn.addEventListener('click', () => {
                if (descEl.classList.contains('desc-clamp')) { descEl.classList.remove('desc-clamp'); toggleBtn.innerText = '접기'; card.style.height = 'auto'; }
                else { descEl.classList.add('desc-clamp'); toggleBtn.innerText = '자세히 보기'; card.style.height = '120px'; }
            });
            descEl.parentElement.appendChild(toggleBtn);
        }
    }, 10);

    if (data.expirationDays !== 'permanent') {
        let expireTime = data.uploadTime + (data.expirationDays * 24 * 60 * 60 * 1000);
        const interval = setInterval(() => {
            const now = new Date().getTime(); const timeLeft = expireTime - now;
            if (timeLeft <= 0) { statusDiv.innerText = "만료됨 (새로고침 시 자동 정리)"; extendBtn.style.display = 'none'; clearInterval(interval); return; }
            const hoursLeft = timeLeft / (1000 * 60 * 60);
            statusDiv.innerText = hoursLeft < 24 ? `${Math.floor(hoursLeft)}시간 후 만료` : `${Math.floor(hoursLeft / 24) + 1}일 후 만료`;

            if (hoursLeft <= 24) { extendBtn.style.display = 'inline-block'; statusDiv.style.color = '#e74c3c'; statusDiv.style.fontWeight = 'bold'; }
            else { extendBtn.style.display = 'none'; statusDiv.style.color = '#555'; statusDiv.style.fontWeight = 'normal'; }
        }, 1000);

        extendBtn.onclick = async () => {
            const newUploadTime = new Date().getTime();
            try {
                if (docId) await updateDoc(doc(db, 'cards', docId), { uploadTime: newUploadTime });
                data.uploadTime = newUploadTime; expireTime = newUploadTime + (data.originalDuration * 24 * 60 * 60 * 1000);
                alert(`${data.originalDuration}일로 기간이 연장되었습니다.`); extendBtn.style.display = 'none';
            } catch (error) { console.error("기간 연장 실패:", error); alert("기간 연장에 실패했습니다."); }
        };
    } else { statusDiv.innerText = "영구 보관"; statusDiv.style.color = "#555"; }
}

function showMultiDownloadModal(data, badgeText) {
    multiDownloadList.innerHTML = '';
    const isPhoto = badgeText === 'PHOTO';
    const urls = Array.isArray(data.content) ? data.content : [data.content];
    const names = Array.isArray(data.originalNames) ? data.originalNames : urls.map((url, i) => url.split('/').pop() || `file_${i + 1}`);
    const sizes = Array.isArray(data.sizes) ? data.sizes : (data.sizes ? [data.sizes] : []);

    urls.forEach((url, i) => {
        const li = document.createElement('li'); li.className = 'multi-download-item';
        let iconHtml = isPhoto ? `<img src="${url}" alt="thumbnail">` : `<span class="material-symbols-outlined">insert_drive_file</span>`;
        const fileName = names[i] || `file_${i + 1}`;
        const fileSizeBytes = sizes[i] ? sizes[i] : (data.size && urls.length === 1 ? Math.round(parseFloat(data.size) * 1024 * 1024) : 0);
        const sizeText = fileSizeBytes > 0 ? `<div style="font-size: 0.75rem; color: #888; margin-top: 2px;">${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB</div>` : '';

        li.innerHTML = `${iconHtml}
        <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
            <span class="multi-download-item-name">${fileName}</span>
            ${sizeText}
        </div>
        <span class="material-symbols-outlined" style="margin-right: 0; color: #3498db;">download</span>`;
        
        li.addEventListener('click', () => {
            forceDownload(url, fileName);
            li.style.backgroundColor = '#e8f4fd'; setTimeout(() => li.style.backgroundColor = '', 300);
        });
        multiDownloadList.appendChild(li);
    });

    multiDownloadTitle.innerText = isPhoto ? '사진 목록' : '파일 목록';
    multiDownloadModal.style.display = 'flex';

    const batchDownloadBtn = document.getElementById('batchDownloadBtn');
    if (batchDownloadBtn) {
        batchDownloadBtn.onclick = async () => {
            batchDownloadBtn.disabled = true;
            batchDownloadBtn.innerHTML = '<span class="material-symbols-outlined">sync</span> <span style="margin-left:8px;">준비 중...</span>';
            
            for (let i = 0; i < urls.length; i++) {
                batchDownloadBtn.innerHTML = `<span class="material-symbols-outlined">sync</span> <span style="margin-left:8px;">다운로드 중 (${i + 1}/${urls.length})</span>`;
                await forceDownload(urls[i], names[i] || `file_${i + 1}`);
                await new Promise(r => setTimeout(r, 600)); // 브라우저 다운로드 제한 우회를 위한 시간 간격
            }
            batchDownloadBtn.innerHTML = '<span class="material-symbols-outlined">check_circle</span> 완료됨';
            batchDownloadBtn.style.background = '#28a745';
            
            setTimeout(() => {
                batchDownloadBtn.disabled = false;
                batchDownloadBtn.innerHTML = '<span class="material-symbols-outlined">download_for_offline</span> 전체 일괄 다운로드';
                batchDownloadBtn.style.background = '#4A90E2';
            }, 3000);
        };
    }
}

function showMemoViewModal(data, docId = null) {
    const memoViewModal = document.getElementById('memoViewModal');
    const memoViewTitle = document.getElementById('memoViewTitle');
    const memoViewContent = document.getElementById('memoViewContent');
    const memoViewCopyBtn = document.getElementById('memoViewCopyBtn');
    const memoViewSaveBtn = document.getElementById('memoViewSaveBtn');
    const closeMemoViewBtn = document.getElementById('closeMemoViewBtn');

    memoViewTitle.innerText = data.name || '제목없음';
    memoViewContent.value = data.content;
    closeMemoViewBtn.onclick = () => memoViewModal.style.display = 'none';

    memoViewCopyBtn.onclick = () => {
        navigator.clipboard.writeText(memoViewContent.value).then(() => {
            memoViewCopyBtn.innerText = '복사됨 ✓'; memoViewCopyBtn.style.background = '#28a745';
            setTimeout(() => { memoViewCopyBtn.innerText = '내용 복사'; memoViewCopyBtn.style.background = ''; }, 1500);
        });
    };

    memoViewSaveBtn.onclick = async () => {
        const newContent = memoViewContent.value.trim();
        if (!newContent || newContent === data.content) { memoViewModal.style.display = 'none'; return; }
        memoViewSaveBtn.disabled = true; memoViewSaveBtn.innerText = '저장 중...';

        try {
            if (docId) await updateDoc(doc(db, 'cards', docId), { content: newContent });
            data.content = newContent;
            const cardEl = document.querySelector(`.list-card[data-id="${docId}"]`);
            if (cardEl) { const descEl = cardEl.querySelector('.card-desc'); if (descEl) descEl.innerText = newContent; }
            memoViewSaveBtn.innerText = '저장됨 ✓'; memoViewSaveBtn.style.background = '#28a745';
            setTimeout(() => { memoViewModal.style.display = 'none'; memoViewSaveBtn.innerText = '저장'; memoViewSaveBtn.style.background = ''; memoViewSaveBtn.disabled = false; }, 1000);
        } catch (err) { alert('저장에 실패했습니다.'); memoViewSaveBtn.innerText = '저장'; memoViewSaveBtn.disabled = false; }
    };
    memoViewModal.style.display = 'flex';
}

if (appTitleBtn) {
    appTitleBtn.addEventListener('click', () => window.location.reload());
}
