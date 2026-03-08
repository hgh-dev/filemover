// Firebase SDK 모듈 임포트
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// TODO: 본인의 Firebase 프로젝트 설정값으로 교체해야 합니다.
const firebaseConfig = {
    apiKey: "AIzaSyC49b-msgDEf_vorf1gmu3dJ_oKDPUrh5k",
    authDomain: "filemover-7cc9f.firebaseapp.com",
    projectId: "filemover-7cc9f",
    storageBucket: "filemover-7cc9f.firebasestorage.app",
    messagingSenderId: "Y857800312653",
    appId: "Y1:857800312653:web:3af4530ef8722cab695904",
    measurementId: "G-ZN7EWK4NB8"
};

// PWA: 서비스 워커 등록
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
            .catch(err => console.log('Service Worker 등록 실패: ', err));
    });
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

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
const mainAddBtn = document.getElementById('mainAddBtn');
const addMenuPopup = document.getElementById('addMenuPopup');
const menuAddMemo = document.getElementById('menuAddMemo');
const menuAddLink = document.getElementById('menuAddLink');
const menuAddPhoto = document.getElementById('menuAddPhoto');
const menuAddFile = document.getElementById('menuAddFile');
const appTitleBtn = document.getElementById('appTitleBtn');

const photoInput = document.getElementById('photoInput');
const generalFileInput = document.getElementById('generalFileInput');
const photoResizeModal = document.getElementById('photoResizeModal');
const resizeOption = document.getElementById('resizeOption');
const customWidthInput = document.getElementById('customWidth');
const cancelPhotoBtn = document.getElementById('cancelPhotoBtn');
const confirmPhotoBtn = document.getElementById('confirmPhotoBtn');

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

closeMultiDownloadBtn.addEventListener('click', () => multiDownloadModal.style.display = 'none');

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
        const now = new Date().getTime();

        for (const docSnap of querySnapshot.docs) {
            const cardData = docSnap.data();
            const docId = docSnap.id;

            // ★★★ [3차 방어] 업로드 중단된 찌꺼기 파일 청소 ★★★
            if (cardData.status === 'uploading') {
                console.log(`🧹 [중단된 업로드 청소] 찌꺼기 카드 발견. 삭제 진행...`);
                // 클라우드에 중간까지 올라간 파일이 있다면 모두 삭제
                if (cardData.publicIds && cardData.publicIds.length > 0) {
                    const rType = cardData.type === 'image' ? 'image' : 'raw';
                    const pIds = Array.isArray(cardData.publicIds) ? cardData.publicIds : [cardData.publicIds];
                    for (const pid of pIds) {
                        await deleteCloudinaryFile(pid, rType);
                    }
                }
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
                if (cardData.type !== 'text' && cardData.publicIds) {
                    const rType = cardData.type === 'image' ? 'image' : 'raw';
                    const pIds = Array.isArray(cardData.publicIds) ? cardData.publicIds : [cardData.publicIds];
                    for (const pid of pIds) {
                        await deleteCloudinaryFile(pid, rType);
                    }
                }
                await deleteDoc(doc(db, 'cards', docId));

                expiredCount++;
                if (expiredNames.length < 2) expiredNames.push(cardData.name || '이름 없음');
            } else {
                cardsToRender.push({ id: docId, ...cardData });
            }
        }

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

        // 1. 기간 만료 알림
        if (expiredCount > 0) {
            let alertMsg = `기간이 만료되어 ${expiredCount}개의 카드 및 그 데이터가 자동 삭제되었습니다.\n`;
            alertMsg += expiredCount === 1 ? `(삭제된 항목: ${expiredNames[0]})` : `(삭제된 항목: ${expiredNames.join(', ')} 외)`;
            setTimeout(() => alert(alertMsg), 300);
        }

        // 2. 업로드 중단 파일 청소 알림
        if (trashCleanedCount > 0) {
            setTimeout(() => alert(`이전에 중단되었던 업로드가 ${trashCleanedCount}건 있었습니다. 중단 전 업로드된 데이터가 서버에서 자동 삭제되었습니다.`), 600);
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
profileBtn.addEventListener('click', (e) => { e.stopPropagation(); profilePopup.style.display = profilePopup.style.display === 'none' ? 'flex' : 'none'; });
mainAddBtn.addEventListener('click', (e) => { e.stopPropagation(); addMenuPopup.style.display = addMenuPopup.style.display === 'none' ? 'flex' : 'none'; });
document.addEventListener('click', (e) => {
    if (profilePopup && !profilePopup.contains(e.target) && !profileBtn.contains(e.target)) profilePopup.style.display = 'none';
    if (addMenuPopup && !addMenuPopup.contains(e.target) && !mainAddBtn.contains(e.target)) addMenuPopup.style.display = 'none';
});

menuAddMemo.addEventListener('click', () => { addMenuPopup.style.display = 'none'; memoInput.value = ''; memoModal.style.display = 'flex'; });
menuAddLink.addEventListener('click', () => { addMenuPopup.style.display = 'none'; linkInput.value = ''; linkModal.style.display = 'flex'; });
menuAddPhoto.addEventListener('click', () => { addMenuPopup.style.display = 'none'; photoResizeModal.style.display = 'flex'; });
resizeOption.addEventListener('change', function () { customWidthInput.style.display = this.value === 'custom' ? 'inline-block' : 'none'; });
cancelPhotoBtn.addEventListener('click', () => photoResizeModal.style.display = 'none');
confirmPhotoBtn.addEventListener('click', () => { photoResizeModal.style.display = 'none'; photoInput.click(); });
menuAddFile.addEventListener('click', () => { addMenuPopup.style.display = 'none'; generalFileInput.click(); });
cancelMemoBtn.addEventListener('click', () => memoModal.style.display = 'none');
cancelLinkBtn.addEventListener('click', () => linkModal.style.display = 'none');

saveMemoBtn.addEventListener('click', async () => {
    const title = memoTitleInput.value.trim();
    const text = memoInput.value.trim();
    if (!text || !auth.currentUser) return;
    saveMemoBtn.disabled = true;

    const cardData = { uid: auth.currentUser.uid, type: 'text', name: title || '제목없음', content: text, expirationDays: 'permanent', uploadTime: new Date().getTime(), status: 'complete' };
    try {
        const docRef = await addDoc(collection(db, "cards"), cardData);
        createCard(cardData, docRef.id);
        memoModal.style.display = 'none'; memoTitleInput.value = ''; memoInput.value = '';
    } catch (error) { console.error("메모 저장 실패:", error); } 
    finally { saveMemoBtn.disabled = false; }
});

saveLinkBtn.addEventListener('click', async () => {
    const link = linkInput.value.trim();
    if (!link || !auth.currentUser) return;
    saveLinkBtn.disabled = true;

    const cardData = { uid: auth.currentUser.uid, type: 'text', content: link, expirationDays: 'permanent', uploadTime: new Date().getTime(), status: 'complete' };
    try {
        const docRef = await addDoc(collection(db, "cards"), cardData);
        createCard(cardData, docRef.id);
        linkModal.style.display = 'none'; linkInput.value = '';
    } catch (error) { console.error("링크 저장 실패:", error); } 
    finally { saveLinkBtn.disabled = false; }
});

async function sha1(str) {
    const buffer = new TextEncoder("utf-8").encode(str);
    const digest = await crypto.subtle.digest("SHA-1", buffer);
    return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
}

async function deleteCloudinaryFile(publicId, resourceType = 'image') {
    const cloudName = 'dxcfrulyd'; const apiKey = '822956219941674'; const apiSecret = 'rZhoHQ7DOnbmIh0iZgUNfTfzuUs';
    const timestamp = Math.floor(Date.now() / 1000);
    const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = await sha1(signatureString);

    const formData = new FormData();
    formData.append('public_id', publicId); formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp); formData.append('signature', signature);
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`;

    try { await fetch(url, { method: 'POST', body: formData }); } 
    catch (error) { console.error("Cloudinary 삭제 실패:", error); }
}

let totalUsedSpace = 0;
const MAX_SPACE = 100 * 1024 * 1024;

// ★★★ 업로드 핵심 로직 (빈 카드 선발행 & 올바른 폴더/이름 적용) ★★★
async function handleFilesUpload(files, type) {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    let totalNewSize = 0;
    for (let file of fileArray) totalNewSize += file.size;

    if (totalUsedSpace + totalNewSize > MAX_SPACE) {
        alert(`전체 할당 용량(100MB)을 초과할 수 없습니다.`); return;
    }

    const overlay = document.getElementById('uploadOverlay');
    const overlayFilename = document.getElementById('uploadFilename');
    const overlayBar = document.getElementById('uploadProgressBar');
    const overlayPct = document.getElementById('uploadProgressPct');
    const overlayCount = document.getElementById('uploadCountLabel');
    overlay.classList.add('active');
    
    const uploadTimestamp = new Date().getTime();
    const uid = auth.currentUser.uid;
    let isImageGroup = type === 'image';

    // 1. [핵심] 폴더 경로(uid/)가 포함된 전체 ID를 미리 생성합니다.
    const preGeneratedPublicIds = fileArray.map((file, i) => {
        const nameBase = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        // 삭제 시 혼선을 방지하기 위해 'uid/파일이름' 형태로 저장합니다.
        return `${uid}/${nameBase}_${uploadTimestamp}_${i}`;
    });
    const preGeneratedNames = fileArray.map(file => file.name);

    const sizeInMB = totalNewSize / (1024 * 1024);
    let expirationDays = 30;
    if (sizeInMB >= 50) expirationDays = 3; else if (sizeInMB >= 10) expirationDays = 7;

    let docRef;
    try {
        // 2. [가장 중요] 업로드 '시작 전'에 장부에 모든 ID를 미리 적어둡니다. (status: uploading)
        docRef = await addDoc(collection(db, "cards"), {
            uid: uid,
            type: isImageGroup ? 'image' : 'file',
            content: [],
            originalNames: preGeneratedNames,
            publicIds: preGeneratedPublicIds, // 중단되어도 이 기록을 보고 지웁니다.
            name: "업로드 진행 중...",
            size: (totalNewSize / (1024 * 1024)).toFixed(2),
            expirationDays: expirationDays,
            originalDuration: expirationDays,
            uploadTime: uploadTimestamp,
            fileCount: fileArray.length,
            status: 'uploading' 
        });
    } catch (e) {
        console.error("임시 문서 생성 에러: ", e);
        overlay.classList.remove('active'); return;
    }

    let fileUrls = [];
    const cloudName = 'dxcfrulyd';

    for (let i = 0; i < fileArray.length; i++) {
        let file = fileArray[i];
        if (isImageGroup) file = await resizeImage(file);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'filemover');
        // 3. 미리 생성한 '폴더 포함 ID'를 클라우디너리에 그대로 전달합니다.
        formData.append('public_id', preGeneratedPublicIds[i]); 

        overlayFilename.innerText = file.name;
        overlayCount.innerText = fileArray.length > 1 ? `파일 ${i + 1} / ${fileArray.length}` : '';

        try {
            const data = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        overlayBar.style.width = pct + '%'; overlayPct.innerText = pct + '%';
                    }
                };
                xhr.onload = () => resolve(JSON.parse(xhr.responseText));
                xhr.onerror = () => reject(new Error('네트워크 오류'));
                xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);
                xhr.send(formData);
            });

            if (data.secure_url) {
                fileUrls.push(data.secure_url);
                totalUsedSpace += file.size;
            }
        } catch (error) {
            console.error("파일 업로드 에러:", error);
            // 개별 파일 실패 시에도 루프는 계속 돌아가도록 둡니다.
        }
    }

    overlay.classList.remove('active');

    if (fileUrls.length > 0) {
        updateQuotaUI();
        let finalCardName = fileArray.length > 1 ? `${preGeneratedNames[0]} 외 ${fileArray.length - 1}건` : preGeneratedNames[0];

        // 4. 모든 업로드 완료 후 상태를 'complete'로 변경하여 청소 대상에서 제외시킵니다.
        await updateDoc(doc(db, 'cards', docRef.id), {
            content: fileUrls.length === 1 ? fileUrls[0] : fileUrls,
            name: finalCardName,
            status: 'complete'
        });
        
        // UI 반영을 위한 데이터 객체
        const finalData = {
            uid, type: isImageGroup ? 'image' : 'file',
            content: fileUrls.length === 1 ? fileUrls[0] : fileUrls,
            originalNames: preGeneratedNames.length === 1 ? preGeneratedNames[0] : preGeneratedNames,
            publicIds: preGeneratedPublicIds.length === 1 ? preGeneratedPublicIds[0] : preGeneratedPublicIds,
            name: finalCardName,
            size: (totalNewSize / (1024 * 1024)).toFixed(2),
            expirationDays, originalDuration: expirationDays,
            uploadTime: new Date().getTime(),
            status: 'complete'
        };
        createCard(finalData, docRef.id);
    } else {
        // 하나도 안 올라갔다면 카드 자체를 삭제
        await deleteDoc(doc(db, 'cards', docRef.id));
    }
}

function resizeImage(file) {
    return new Promise((resolve) => {
        const option = resizeOption.value;
        if (option === 'original') {
            resolve(file); 
            return;
        }

        let targetWidth = option === 'custom' ? parseInt(customWidthInput.value) : parseInt(option);
        if (!targetWidth || isNaN(targetWidth)) targetWidth = 860;

        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            if (img.width <= targetWidth) {
                resolve(file);
                return;
            }
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const ratio = targetWidth / img.width;
            canvas.width = targetWidth;
            canvas.height = img.height * ratio;

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                resolve(new File([blob], `resize_${file.name}`, {
                    type: file.type,
                    lastModified: Date.now()
                }));
            }, file.type, 0.9);
        };
    });
}

photoInput.addEventListener('change', (e) => { handleFilesUpload(e.target.files, 'image'); photoInput.value = ''; });
generalFileInput.addEventListener('change', (e) => { handleFilesUpload(e.target.files, 'file'); generalFileInput.value = ''; });

function updateQuotaUI() { document.getElementById('quotaInfo').innerText = `현재 사용량: ${(totalUsedSpace / (1024 * 1024)).toFixed(2)} MB / 100 MB`; }

document.getElementById('resetAllBtn').addEventListener('click', async () => {
    if (!auth.currentUser) return;
    if (!confirm('모든 카드를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;

    const uid = auth.currentUser.uid;
    try {
        const q = query(collection(db, 'cards'), where('uid', '==', uid));
        const snapshot = await getDocs(q);
        
        for (const d of snapshot.docs) {
            const cardData = d.data();
            if (cardData.type !== 'text' && cardData.publicIds) {
                const rType = cardData.type === 'image' ? 'image' : 'raw';
                const pIds = Array.isArray(cardData.publicIds) ? cardData.publicIds : [cardData.publicIds];
                for (const pid of pIds) await deleteCloudinaryFile(pid, rType);
            }
            await deleteDoc(doc(db, 'cards', d.id));
        }

        document.getElementById('cardContainer').innerHTML = ''; totalUsedSpace = 0; updateQuotaUI();
    } catch (error) { console.error('전체 삭제 중 오류 발생:', error); alert('초기화에 실패했습니다.'); }
});

let currentFilter = 'all'; 
document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active'); currentFilter = chip.dataset.filter; applyFilter(currentFilter);
    });
});

function applyFilter(filter) {
    const cards = document.querySelectorAll('.list-card');
    cards.forEach(card => {
        if (filter === 'all') card.style.display = '';
        else if (filter === 'text') card.style.display = card.dataset.cardType === 'memo' ? '' : 'none';
        else if (filter === 'link') card.style.display = card.dataset.cardType === 'link' ? '' : 'none';
        else if (filter === 'image') card.style.display = card.dataset.cardType === 'image' ? '' : 'none';
        else if (filter === 'file') card.style.display = card.dataset.cardType === 'file' ? '' : 'none';
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

    const moreBtnWrap = document.createElement('div'); moreBtnWrap.style.position = 'relative';
    moreBtnWrap.innerHTML = `
        <button class="action-icon-btn more-btn"><span class="material-symbols-outlined">more_vert</span></button>
        <div class="delete-menu" style="display:none; position:absolute; right:0; top:100%; background:white; border:1px solid #ddd; border-radius:4px; box-shadow:0 4px 6px rgba(0,0,0,0.1); z-index:10; min-width:80px;">
            <button class="delete-action-btn" style="color:#dc3545; background:none; border:none; padding:10px 16px; width:100%; text-align:left; cursor:pointer; white-space:nowrap; font-size:13px;">삭제</button>
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
    titleEl.addEventListener('click', () => {
        if (data.type === 'text') {
            if (badgeText === 'WEB') { let url = data.content; if (!url.match(/^https?:\/\//i)) url = 'http://' + url; window.open(url, '_blank'); } 
            else { showMemoViewModal(data, docId); }
        } else {
            let modalData = data;
            if (!Array.isArray(data.content)) modalData = { ...data, content: [data.content], originalNames: [data.originalNames || data.name || '파일'], fileCount: 1 };
            showMultiDownloadModal(modalData, badgeText);
        }
    });

    const moreBtn = moreBtnWrap.querySelector('.more-btn');
    const deleteMenu = moreBtnWrap.querySelector('.delete-menu');
    const deleteBtn = moreBtnWrap.querySelector('.delete-action-btn');

    moreBtn.addEventListener('click', (e) => {
        e.stopPropagation(); const isVisible = deleteMenu.style.display === 'block';
        document.querySelectorAll('.delete-menu').forEach(m => m.style.display = 'none');
        if (!isVisible) deleteMenu.style.display = 'block';
    });

    document.addEventListener('click', () => { deleteMenu.style.display = 'none'; });

    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation(); deleteMenu.style.display = 'none';
        if (!confirm('정말 이 카드를 삭제하시겠습니까?')) return;
        
        try {
            if (data.type !== 'text' && data.publicIds) {
                const rType = data.type === 'image' ? 'image' : 'raw';
                const pIds = Array.isArray(data.publicIds) ? data.publicIds : [data.publicIds];
                for (const pid of pIds) await deleteCloudinaryFile(pid, rType);
            }
            if (docId) await deleteDoc(doc(db, 'cards', docId));
            if (data.type !== 'text' && data.size) {
                totalUsedSpace -= (parseFloat(data.size) * 1024 * 1024);
                if (totalUsedSpace < 0) totalUsedSpace = 0; updateQuotaUI();
            }
            card.remove();
        } catch (error) { console.error('삭제 중 오류 발생:', error); alert('데이터 삭제에 실패했습니다.'); }
    });

    const statusContainer = bodyDiv.querySelector('.card-status-container');
    const statusDiv = statusContainer.querySelector('.card-status');
    const extendBtn = document.createElement('button'); extendBtn.className = 'extend-btn'; extendBtn.innerText = '연장'; extendBtn.style.display = 'none';
    statusContainer.appendChild(extendBtn); 
    container.insertBefore(card, container.firstChild); 
    if (typeof currentFilter !== 'undefined' && currentFilter !== 'all') applyFilter(currentFilter);

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
            
            if (hoursLeft <= 48) { extendBtn.style.display = 'inline-block'; statusDiv.style.color = '#e74c3c'; statusDiv.style.fontWeight = 'bold'; } 
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

    urls.forEach((url, i) => {
        const li = document.createElement('li'); li.className = 'multi-download-item';
        let iconHtml = isPhoto ? `<img src="${url}" alt="thumbnail">` : `<span class="material-symbols-outlined">insert_drive_file</span>`;
        const fileName = names[i] || `file_${i + 1}`;

        li.innerHTML = `${iconHtml}<span class="multi-download-item-name">${fileName}</span><span class="material-symbols-outlined" style="margin-right: 0; color: #3498db;">download</span>`;
        li.addEventListener('click', () => {
            forceDownload(url, fileName);
            li.style.backgroundColor = '#e8f4fd'; setTimeout(() => li.style.backgroundColor = '', 300);
        });
        multiDownloadList.appendChild(li);
    });

    multiDownloadTitle.innerText = isPhoto ? '사진 목록' : '파일 목록';
    multiDownloadModal.style.display = 'flex';
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
