// Firebase SDK 모듈 임포트 (CDN 방식) - 💡 getDoc 추가됨
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
            .then(reg => console.log('Service Worker 등록 성공: ', reg.scope))
            .catch(err => console.log('Service Worker 등록 실패: ', err));
    });
}

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// DOM 요소 
const loadingScreen = document.getElementById('loadingScreen');
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

closeMultiDownloadBtn.addEventListener('click', () => {
    multiDownloadModal.style.display = 'none';
    // 만약 공유 모드로 들어왔다가 창을 닫으면 로그인 화면으로 돌아가게 함
    if (new URLSearchParams(window.location.search).get('share') && !auth.currentUser) {
        loginScreen.style.display = 'flex';
    }
});

// ==========================================
// ★★★ [신규] 공유 링크 손님(Guest) 모드 감지 ★★★
// ==========================================
const urlParams = new URLSearchParams(window.location.search);
const shareId = urlParams.get('share');
let isGuestMode = false;

if (shareId) {
    isGuestMode = true;
    loginScreen.style.display = 'none';
    
    // index.html에 추가하신 loadingScreen이 있다면 표시합니다
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
    }
    
    handleShareLink(shareId);
}

// ★ 공유 링크 데이터 불러오기 함수
async function handleShareLink(id) {
    try {
        const docRef = doc(db, 'cards', id);
        const docSnap = await getDoc(docRef);
        
        if (loadingScreen) loadingScreen.style.display = 'none';

        if (docSnap.exists()) {
            const data = docSnap.data();
            // 손님에게 해당 카드의 모달창 띄우기 (마지막 파라미터 true = 공유 모드)
            if (data.type === 'text') {
                showMemoViewModal(data, id, true);
            } else {
                showMultiDownloadModal(data, data.type === 'image' ? 'PHOTO' : 'FILE', true);
            }
        } else {
            alert('만료되었거나 원본 작성자가 삭제한 공유 링크입니다.');
            loginScreen.style.display = 'flex';
        }
    } catch (e) {
        console.error("공유 링크 오류:", e);
        if (loadingScreen) loadingScreen.style.display = 'none';
        alert("링크를 불러오는데 실패했습니다. (권한 오류일 수 있습니다.)");
        loginScreen.style.display = 'flex';
    }
}

// ★ 공유받은 카드를 내 앱(DB)에 복사해서 저장하는 함수
async function saveSharedCardToMyApp(data) {
    // 1. 로그인이 안 되어있으면 구글 로그인 팝업 띄우기
    if (!auth.currentUser) {
        try {
            await signInWithPopup(auth, provider);
        } catch (e) {
            alert("저장하려면 로그인이 필요합니다.");
            return;
        }
    }

    if (data.uid === auth.currentUser.uid) {
        alert("이미 선생님의 계정에 있는 파일입니다!");
        return;
    }

    // 2. 내 DB에 저장할 '사본' 데이터 만들기
    // 중요: isSharedCopy 꼬리표를 붙여서 삭제 시 원본 클라우드 파일을 건드리지 않게 방어!
    const newCardData = {
        uid: auth.currentUser.uid,
        type: data.type,
        content: data.content,
        originalNames: data.originalNames || data.name,
        name: `[공유받음] ${data.name || '파일'}`,
        size: data.size,
        expirationDays: 'permanent', // 공유받은 링크는 영구보관 처리
        uploadTime: new Date().getTime(),
        fileCount: data.fileCount || 1,
        isSharedCopy: true 
    };

    try {
        await addDoc(collection(db, "cards"), newCardData);
        alert("선생님의 File Mover에 성공적으로 보관되었습니다!\n이제 언제 어디서든 다운로드할 수 있습니다.");
        
        // 팝업들 닫고 내 메인 화면으로 이동
        document.getElementById('memoViewModal').style.display = 'none';
        document.getElementById('multiDownloadModal').style.display = 'none';
        
        // URL에서 share 파라미터 지우기 (원래 앱 주소로 깔끔하게 변경)
        window.history.replaceState({}, document.title, window.location.pathname);
        isGuestMode = false;
        
        // 내 데이터 다시 불러오기
        appContent.style.display = 'flex';
        loadUserData(auth.currentUser.uid);
    } catch (e) {
        console.error("저장 실패", e);
        alert("보관에 실패했습니다.");
    }
}

// ==========================================
// 인증 상태 감지 및 UI 전환
// ==========================================
onAuthStateChanged(auth, (user) => {
    // 손님 모드로 URL 접속 중일 땐 메인화면 로딩 패스
    if (isGuestMode) return; 

    if (user) {
        if (loadingScreen) loadingScreen.style.display = 'none';
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

            // 공유받은 사본은 내 용량을 차지하지 않으므로 계산에서 제외
            if (cardData.size && !cardData.isSharedCopy) { 
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

// === 1차 방어: 접속 시 일괄 청소 로직 ===
async function loadUserData(uid) {
    const container = document.getElementById('cardContainer');
    container.innerHTML = '';
    totalUsedSpace = 0;

    let expiredCount = 0;
    let expiredNames = [];

    try {
        const q = query(collection(db, "cards"), where("uid", "==", uid));
        const querySnapshot = await getDocs(q);
        const cardsToRender = [];
        const now = new Date().getTime();

        for (const docSnap of querySnapshot.docs) {
            const cardData = docSnap.data();
            const docId = docSnap.id;

            let isExpired = false;
            if (cardData.expirationDays !== 'permanent') {
                const expireTime = cardData.uploadTime + (cardData.expirationDays * 24 * 60 * 60 * 1000);
                if (now > expireTime) {
                    isExpired = true;
                }
            }

            if (isExpired) {
                // 원본 파일만 클라우드에서 지우고, 남에게서 복사해온 파일(isSharedCopy)은 클라우드를 건드리지 않음
                if (cardData.type !== 'text' && cardData.publicIds && !cardData.isSharedCopy) {
                    const rType = cardData.type === 'image' ? 'image' : 'raw';
                    const pIds = Array.isArray(cardData.publicIds) ? cardData.publicIds : [cardData.publicIds];
                    for (const pid of pIds) {
                        await deleteCloudinaryFile(pid, rType);
                    }
                }
                
                await deleteDoc(doc(db, 'cards', docId));

                expiredCount++;
                if (expiredNames.length < 2) {
                    expiredNames.push(cardData.name || '이름 없음');
                }
            } else {
                cardsToRender.push({ id: docId, ...cardData });
            }
        }

        cardsToRender.sort((a, b) => a.uploadTime - b.uploadTime);
        const ghostCleanupPromises = [];

        cardsToRender.forEach(cardData => {
            createCard(cardData, cardData.id);
            // 공유받은 사본은 내 용량 계산에서 제외
            if (cardData.size && !cardData.isSharedCopy) {
                totalUsedSpace += (parseFloat(cardData.size) * 1024 * 1024);
            }
            ghostCleanupPromises.push(performGhostDataCleanup(cardData, cardData.id));
        });
        
        updateQuotaUI();

        if (expiredCount > 0) {
            let alertMsg = `기간이 만료되어 ${expiredCount}개의 데이터가 자동 삭제되었습니다.\n`;
            if (expiredCount === 1) {
                alertMsg += `(삭제된 항목: ${expiredNames[0]})`;
            } else if (expiredCount === 2) {
                alertMsg += `(삭제된 항목: ${expiredNames.join(', ')})`;
            } else {
                alertMsg += `(삭제된 항목: ${expiredNames.join(', ')} 외 ${expiredCount - 2}건)`;
            }
            setTimeout(() => {
                alert(alertMsg);
            }, 300);
        }

        Promise.all(ghostCleanupPromises).then(results => {
            const ghostDeletedCount = results.reduce((sum, current) => sum + current, 0);
            if (ghostDeletedCount > 0) {
                setTimeout(() => {
                    alert(`${ghostDeletedCount}건의 카드가 원본 파일 삭제로 인해 자동 정리되었습니다.`);
                }, 800);
            }
        });

    } catch (error) {
        console.error("데이터 로드 중 오류 발생:", error);
    }
}

loginBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider).catch(error => {
        console.error("로그인 에러:", error);
        alert("로그인에 실패했습니다.");
    });
});

logoutBtn.addEventListener('click', () => {
    signOut(auth).catch(error => {
        console.error("로그아웃 에러:", error);
    });
});

profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    profilePopup.style.display = profilePopup.style.display === 'none' ? 'flex' : 'none';
});

mainAddBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    addMenuPopup.style.display = addMenuPopup.style.display === 'none' ? 'flex' : 'none';
});

document.addEventListener('click', (e) => {
    if (profilePopup && !profilePopup.contains(e.target) && !profileBtn.contains(e.target)) {
        profilePopup.style.display = 'none';
    }
    if (addMenuPopup && !addMenuPopup.contains(e.target) && !mainAddBtn.contains(e.target)) {
        addMenuPopup.style.display = 'none';
    }
});

menuAddMemo.addEventListener('click', () => {
    addMenuPopup.style.display = 'none';
    memoInput.value = '';
    memoModal.style.display = 'flex';
});

menuAddLink.addEventListener('click', () => {
    addMenuPopup.style.display = 'none';
    linkInput.value = '';
    linkModal.style.display = 'flex';
});

menuAddPhoto.addEventListener('click', () => {
    addMenuPopup.style.display = 'none';
    photoResizeModal.style.display = 'flex';
});

resizeOption.addEventListener('change', function () {
    customWidthInput.style.display = this.value === 'custom' ? 'inline-block' : 'none';
});

cancelPhotoBtn.addEventListener('click', () => photoResizeModal.style.display = 'none');
confirmPhotoBtn.addEventListener('click', () => {
    photoResizeModal.style.display = 'none';
    photoInput.click();
});

menuAddFile.addEventListener('click', () => {
    addMenuPopup.style.display = 'none';
    generalFileInput.click();
});

cancelMemoBtn.addEventListener('click', () => memoModal.style.display = 'none');
cancelLinkBtn.addEventListener('click', () => linkModal.style.display = 'none');

saveMemoBtn.addEventListener('click', async () => {
    const title = memoTitleInput.value.trim();
    const text = memoInput.value.trim();
    if (!text) return;

    if (!auth.currentUser) return;
    saveMemoBtn.disabled = true;

    const cardData = {
        uid: auth.currentUser.uid,
        type: 'text',
        name: title || '제목없음', 
        content: text,
        expirationDays: 'permanent',
        uploadTime: new Date().getTime()
    };

    try {
        const docRef = await addDoc(collection(db, "cards"), cardData);
        createCard(cardData, docRef.id);
        memoModal.style.display = 'none';
        memoTitleInput.value = '';
        memoInput.value = '';
    } catch (error) {
        console.error("메모 저장 실패:", error);
    } finally {
        saveMemoBtn.disabled = false;
    }
});

saveLinkBtn.addEventListener('click', async () => {
    const link = linkInput.value.trim();
    if (!link) return;

    if (!auth.currentUser) return;
    saveLinkBtn.disabled = true;

    const cardData = {
        uid: auth.currentUser.uid,
        type: 'text',
        content: link,
        expirationDays: 'permanent',
        uploadTime: new Date().getTime()
    };

    try {
        const docRef = await addDoc(collection(db, "cards"), cardData);
        createCard(cardData, docRef.id);
        linkModal.style.display = 'none';
        linkInput.value = '';
    } catch (error) {
        console.error("링크 저장 실패:", error);
    } finally {
        saveLinkBtn.disabled = false;
    }
});

async function sha1(str) {
    const buffer = new TextEncoder("utf-8").encode(str);
    const digest = await crypto.subtle.digest("SHA-1", buffer);
    return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
}

async function deleteCloudinaryFile(publicId, resourceType = 'image') {
    const cloudName = 'dxcfrulyd';
    const apiKey = '822956219941674';
    const apiSecret = 'rZhoHQ7DOnbmIh0iZgUNfTfzuUs';
    const timestamp = Math.floor(Date.now() / 1000);

    const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = await sha1(signatureString);

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);

    const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`;

    try {
        const response = await fetch(url, { method: 'POST', body: formData });
        const result = await response.json();
        console.log(`Cloudinary 삭제 결과 (${publicId}):`, result);
    } catch (error) {
        console.error("Cloudinary 삭제 실패:", error);
    }
}

let totalUsedSpace = 0;
const MAX_SPACE = 100 * 1024 * 1024;

async function handleFilesUpload(files, type) {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);

    let totalNewSize = 0;
    for (let file of fileArray) {
        totalNewSize += file.size;
    }

    if (totalUsedSpace + totalNewSize > MAX_SPACE) {
        alert(`전체 할당 용량(100MB)을 초과할 수 없습니다. 추가하려는 용량: ${(totalNewSize / (1024 * 1024)).toFixed(2)}MB`);
        return;
    }

    let isImageGroup = type === 'image';
    let fileUrls = [];
    let originalNames = [];
    let publicIds = []; 
    let groupSize = 0;

    const overlay = document.getElementById('uploadOverlay');
    const overlayFilename = document.getElementById('uploadFilename');
    const overlayBar = document.getElementById('uploadProgressBar');
    const overlayPct = document.getElementById('uploadProgressPct');
    const overlayCount = document.getElementById('uploadCountLabel');

    overlay.classList.add('active');
    
    const uploadTimestamp = new Date().getTime();
    const uid = auth.currentUser.uid;

    for (let i = 0; i < fileArray.length; i++) {
        let file = fileArray[i];
        if (isImageGroup) {
            file = await resizeImage(file);
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'filemover');

        // 타임스탬프 꼬리표 붙이기 (폴더명 포함)
        const originalNameBase = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
        formData.append('public_id', `${uid}/${originalNameBase}_${uploadTimestamp}_${i}`); 

        const cloudName = 'dxcfrulyd';

        overlayFilename.innerText = file.name;
        overlayBar.style.width = '0%';
        overlayPct.innerText = '0%';
        overlayCount.innerText = fileArray.length > 1 ? `파일 ${i + 1} / ${fileArray.length}` : '';

        try {
            const data = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const pct = Math.round((event.loaded / event.total) * 100);
                        overlayBar.style.width = pct + '%';
                        overlayPct.innerText = pct + '%';
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve(JSON.parse(xhr.responseText));
                    } else {
                        reject(new Error(`HTTP 오류: ${xhr.status}`));
                    }
                };

                xhr.onerror = () => reject(new Error('네트워크 오류'));

                xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);
                xhr.send(formData);
            });

            if (data.secure_url) {
                totalUsedSpace += file.size;
                groupSize += file.size;
                fileUrls.push(data.secure_url);
                originalNames.push(file.name);
                publicIds.push(data.public_id); 
            } else {
                console.error("Cloudinary 응답 에러:", data);
                alert("일부 파일 업로드에 실패했습니다.");
            }
        } catch (error) {
            console.error("파일 업로드 에러:", error);
            alert("일부 파일 전송에 실패했습니다.");
        }
    }

    overlay.classList.remove('active');
    updateQuotaUI();

    const sizeInMB = groupSize / (1024 * 1024);
    let expirationDays = 30;
    if (sizeInMB >= 50) expirationDays = 3;
    else if (sizeInMB >= 10) expirationDays = 7;

    const cardData = {
        uid: auth.currentUser.uid,
        type: isImageGroup ? 'image' : 'file',
        content: fileUrls.length === 1 ? fileUrls[0] : fileUrls, 
        originalNames: originalNames.length === 1 ? originalNames[0] : originalNames, 
        publicIds: publicIds.length === 1 ? publicIds[0] : publicIds, 
        name: fileArray.length > 1 ? `${fileArray[0].name} 외 ${fileArray.length - 1}건` : fileArray[0].name,
        size: sizeInMB.toFixed(2),
        expirationDays: expirationDays,
        originalDuration: expirationDays,
        uploadTime: new Date().getTime(),
        fileCount: fileArray.length
    };

    try {
        const docRef = await addDoc(collection(db, "cards"), cardData);
        createCard(cardData, docRef.id);
    } catch (e) {
        console.error("DB 문서 생성 에러: ", e);
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
                const resizedFile = new File([blob], `resize_${file.name}`, {
                    type: file.type,
                    lastModified: Date.now()
                });
                resolve(resizedFile);
            }, file.type, 0.9);
        };
    });
}

photoInput.addEventListener('change', (e) => {
    handleFilesUpload(e.target.files, 'image');
    photoInput.value = ''; 
});

generalFileInput.addEventListener('change', (e) => {
    handleFilesUpload(e.target.files, 'file');
    generalFileInput.value = '';
});

function updateQuotaUI() {
    const mb = (totalUsedSpace / (1024 * 1024)).toFixed(2);
    document.getElementById('quotaInfo').innerText = `현재 사용량: ${mb} MB / 100 MB`;
}

document.getElementById('resetAllBtn').addEventListener('click', async () => {
    if (!auth.currentUser) return;
    if (!confirm('모든 카드를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;

    try {
        const q = query(collection(db, 'cards'), where('uid', '==', auth.currentUser.uid));
        const snapshot = await getDocs(q);
        
        for (const d of snapshot.docs) {
            const cardData = d.data();
            // 공유받은 사본이 아닐 때만 클라우드 파일을 삭제
            if (cardData.type !== 'text' && cardData.publicIds && !cardData.isSharedCopy) {
                const rType = cardData.type === 'image' ? 'image' : 'raw';
                const pIds = Array.isArray(cardData.publicIds) ? cardData.publicIds : [cardData.publicIds];
                for (const pid of pIds) {
                    await deleteCloudinaryFile(pid, rType);
                }
            }
            await deleteDoc(doc(db, 'cards', d.id));
        }

        document.getElementById('cardContainer').innerHTML = '';
        totalUsedSpace = 0;
        updateQuotaUI();
    } catch (error) {
        console.error('전체 삭제 중 오류 발생:', error);
        alert('초기화에 실패했습니다.');
    }
});

let currentFilter = 'all'; 

document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        currentFilter = chip.dataset.filter;
        applyFilter(currentFilter);
    });
});

function applyFilter(filter) {
    const cards = document.querySelectorAll('.list-card');
    cards.forEach(card => {
        if (filter === 'all') {
            card.style.display = '';
        } else if (filter === 'text') {
            card.style.display = card.dataset.cardType === 'memo' ? '' : 'none';
        } else if (filter === 'link') {
            card.style.display = card.dataset.cardType === 'link' ? '' : 'none';
        } else if (filter === 'image') {
            card.style.display = card.dataset.cardType === 'image' ? '' : 'none';
        } else if (filter === 'file') {
            card.style.display = card.dataset.cardType === 'file' ? '' : 'none';
        }
    });
}

function formatDate(timestamp) {
    const d = new Date(timestamp);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function forceDownload(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        
        let downloadName = filename;
        if (!downloadName) {
            const urlParts = url.split('/');
            downloadName = urlParts[urlParts.length - 1] || 'download_file';
        }
        
        a.download = downloadName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(blobUrl);
        a.remove();
    } catch (error) {
        console.error('다운로드 오류:', error);
        window.open(url, '_blank');
    }
}

function createCard(data, docId = null) {
    const container = document.getElementById('cardContainer');
    const card = document.createElement('div');
    card.className = 'list-card';
    if (docId) card.dataset.id = docId;

    let badgeClass = 'badge-file';
    let badgeText = 'FILE';

    if (data.type === 'text') {
        if (data.content.startsWith('http')) {
            badgeClass = 'badge-link';
            badgeText = 'WEB';
            card.dataset.cardType = 'link';
        } else {
            badgeClass = 'badge-memo';
            badgeText = 'MEMO';
            card.dataset.cardType = 'memo';
        }
    } else if (data.type === 'image') {
        badgeClass = 'badge-photo';
        badgeText = 'PHOTO';
        card.dataset.cardType = 'image';
    } else {
        card.dataset.cardType = 'file';
    }

    let titleText = data.name || '제목 없음';
    let descText = '';
    let svgIcon = '';

    if (data.type === 'text') {
        if (data.content.startsWith('http')) {
            svgIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#58b2c2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
        } else {
            svgIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e2a849" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>';
        }

        if (!data.name) {
            titleText = badgeText === 'WEB' ? data.content : data.content.substring(0, 30) + (data.content.length > 30 ? '...' : '');
        }
        descText = data.content;
    } else if (data.type === 'image') {
        svgIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e55c91" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
        descText = `용량: ${data.size}MB${data.fileCount && data.fileCount > 1 ? ` (총 ${data.fileCount}건)` : ''}`;
    } else {
        svgIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6a5bbd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>';
        descText = `용량: ${data.size}MB${data.fileCount && data.fileCount > 1 ? ` (총 ${data.fileCount}건)` : ''}`;
    }

    const dateStr = formatDate(data.uploadTime);

    const topRow = document.createElement('div');
    topRow.className = 'card-top-row';

    const badgeEl = document.createElement('span');
    badgeEl.className = `card-badge ${badgeClass}`;
    badgeEl.innerText = badgeText;

    const moreBtnWrap = document.createElement('div');
    moreBtnWrap.style.position = 'relative';
    
    // ★★★ 공유 및 삭제 메뉴 ★★★
    moreBtnWrap.innerHTML = `
        <button class="action-icon-btn more-btn"><span class="material-symbols-outlined">more_vert</span></button>
        <div class="delete-menu" style="display:none; position:absolute; right:0; top:100%; background:white; border:1px solid #ddd; border-radius:4px; box-shadow:0 4px 6px rgba(0,0,0,0.1); z-index:10; min-width:80px;">
            <button class="share-action-btn" style="color:#007bff; background:none; border:none; border-bottom:1px solid #eee; padding:10px 16px; width:100%; text-align:left; cursor:pointer; white-space:nowrap; font-size:13px;">공유하기</button>
            <button class="delete-action-btn" style="color:#dc3545; background:none; border:none; padding:10px 16px; width:100%; text-align:left; cursor:pointer; white-space:nowrap; font-size:13px;">삭제</button>
        </div>
    `;

    topRow.appendChild(badgeEl);
    topRow.appendChild(moreBtnWrap);
    card.appendChild(topRow);

    const bodyDiv = document.createElement('div');
    bodyDiv.className = 'card-body';
    
    // 공유받은 카드일 경우 파란색 '저장된 공유본' 스티커 표시
    let sharedTag = data.isSharedCopy ? `<span style="font-size:0.7rem; color:#4A90E2; background:#e8f4fd; padding:2px 6px; border-radius:4px; margin-left:6px;">저장된 공유본</span>` : '';
    
    bodyDiv.innerHTML = `
        <div style="display: flex; gap: 12px; align-items: flex-start; margin-bottom: 4px;">
            <div style="flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; background: #f8f9fa; border-radius: 8px;">
                ${svgIcon}
            </div>
            <div style="flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; justify-content: center;">
                <h4 class="card-title" style="margin: 0 0 4px 0; display:flex; align-items:center;">
                    ${titleText} ${sharedTag}
                </h4>
                <p class="card-desc desc-clamp" style="margin: 0;">${descText}</p>
            </div>
        </div>
        <span class="card-date">${dateStr}</span>
        <div class="card-status-container" style="display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 2px;">
            <div class="card-status"></div>
        </div>
    `;
    card.appendChild(bodyDiv);

    const titleEl = bodyDiv.querySelector('.card-title');
    titleEl.style.cursor = 'pointer';
    titleEl.title = data.type === 'text' && badgeText !== 'WEB' ? '클릭하여 메모 보기' : '클릭하여 열기 및 다운로드';
    
    titleEl.addEventListener('click', () => {
        if (data.type === 'text') {
            if (badgeText === 'WEB') {
                let url = data.content;
                if (!url.match(/^https?:\/\//i)) url = 'http://' + url;
                window.open(url, '_blank');
            } else {
                showMemoViewModal(data, docId);
            }
        } else {
            let modalData = data;
            if (!Array.isArray(data.content)) {
                const fileName = data.originalNames || data.name || '파일';
                modalData = {
                    ...data,
                    content: [data.content],
                    originalNames: [fileName],
                    fileCount: 1,
                };
            }
            showMultiDownloadModal(modalData, badgeText);
        }
    });

    const moreBtn = moreBtnWrap.querySelector('.more-btn');
    const deleteMenu = moreBtnWrap.querySelector('.delete-menu');
    const shareBtn = moreBtnWrap.querySelector('.share-action-btn');
    const deleteBtn = moreBtnWrap.querySelector('.delete-action-btn');

    // 메뉴 팝업 띄우기
    moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = deleteMenu.style.display === 'block';
        document.querySelectorAll('.delete-menu').forEach(m => m.style.display = 'none');
        if (!isVisible) deleteMenu.style.display = 'block';
    });

    document.addEventListener('click', () => { 
        deleteMenu.style.display = 'none'; 
    });

    // ★★★ 공유 버튼 클릭 이벤트 ★★★
    shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteMenu.style.display = 'none';
        if (!docId) return;
        
        // 현재 앱 URL 뒤에 파라미터 붙여서 링크 생성
        const shareUrl = window.location.origin + window.location.pathname + '?share=' + docId;
        
        navigator.clipboard.writeText(shareUrl).then(() => {
            alert('🔗 공유 링크가 복사되었습니다!\n카톡이나 메시지로 전달해 주세요.\n\n(참고: 내 카드를 삭제하면 공유 링크도 즉시 폭파됩니다)');
        }).catch(err => {
            alert('링크 복사에 실패했습니다. 수동으로 복사해주세요:\n' + shareUrl);
        });
    });

    // ★★★ 삭제 버튼 클릭 이벤트 ★★★
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        deleteMenu.style.display = 'none';
        if (!confirm('정말 이 카드를 삭제하시겠습니까?')) return;
        
        try {
            // 원본 파일일 때만 클라우디너리에서 삭제 (공유 사본은 안 지움)
            if (data.type !== 'text' && data.publicIds && !data.isSharedCopy) {
                const rType = data.type === 'image' ? 'image' : 'raw';
                const pIds = Array.isArray(data.publicIds) ? data.publicIds : [data.publicIds];
                
                for (const pid of pIds) {
                    await deleteCloudinaryFile(pid, rType);
                }
            }

            if (docId) await deleteDoc(doc(db, 'cards', docId));
            
            // 내 용량 깎기
            if (data.type !== 'text' && data.size && !data.isSharedCopy) {
                totalUsedSpace -= (parseFloat(data.size) * 1024 * 1024);
                if (totalUsedSpace < 0) totalUsedSpace = 0;
                updateQuotaUI();
            }
            card.remove();
        } catch (error) {
            console.error('삭제 오류:', error);
            alert('데이터 삭제에 실패했습니다.');
        }
    });

    // 연장 버튼 설정
    const statusContainer = bodyDiv.querySelector('.card-status-container');
    const statusDiv = statusContainer.querySelector('.card-status');
    const extendBtn = document.createElement('button');
    extendBtn.className = 'extend-btn';
    extendBtn.innerText = '연장';
    extendBtn.style.display = 'none';
    statusContainer.appendChild(extendBtn); 

    container.insertBefore(card, container.firstChild); 

    if (typeof currentFilter !== 'undefined' && currentFilter !== 'all') {
        applyFilter(currentFilter);
    }

    // 자세히 보기 토글
    setTimeout(() => {
        const descEl = bodyDiv.querySelector('.card-desc');
        if (descEl && descEl.scrollHeight > descEl.clientHeight) {
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'toggle-desc-btn';
            toggleBtn.innerText = '자세히 보기';

            toggleBtn.addEventListener('click', () => {
                if (descEl.classList.contains('desc-clamp')) {
                    descEl.classList.remove('desc-clamp');
                    toggleBtn.innerText = '접기';
                    card.style.height = 'auto'; 
                } else {
                    descEl.classList.add('desc-clamp');
                    toggleBtn.innerText = '자세히 보기';
                    card.style.height = '120px'; 
                }
            });
            descEl.parentElement.appendChild(toggleBtn);
        }
    }, 10);

    // 기간 만료 타이머
    if (data.expirationDays !== 'permanent') {
        let expireTime = data.uploadTime + (data.expirationDays * 24 * 60 * 60 * 1000);

        const interval = setInterval(() => {
            const now = new Date().getTime();
            const timeLeft = expireTime - now;

            if (timeLeft <= 0) {
                statusDiv.innerText = "만료됨 (새로고침 시 자동 정리)";
                extendBtn.style.display = 'none';
                clearInterval(interval);
                return;
            }

            const hoursLeft = timeLeft / (1000 * 60 * 60);

            if (hoursLeft < 24) {
                statusDiv.innerText = `${Math.floor(hoursLeft)}시간 후 만료`;
            } else {
                statusDiv.innerText = `${Math.floor(hoursLeft / 24) + 1}일 후 만료`;
            }

            // 기간 연장 버튼 표시 (공유 사본이 아닐 때만)
            if (hoursLeft <= 48 && !data.isSharedCopy) {
                extendBtn.style.display = 'inline-block';
                statusDiv.style.color = '#e74c3c';
                statusDiv.style.fontWeight = 'bold';
            } else {
                extendBtn.style.display = 'none';
                statusDiv.style.color = '#555';
                statusDiv.style.fontWeight = 'normal';
            }
        }, 1000);

        extendBtn.onclick = async () => {
            const newUploadTime = new Date().getTime();
            
            try {
                if (docId) {
                    await updateDoc(doc(db, 'cards', docId), { 
                        uploadTime: newUploadTime 
                    });
                }
                
                data.uploadTime = newUploadTime;
                expireTime = newUploadTime + (data.originalDuration * 24 * 60 * 60 * 1000);
                
                alert(`${data.originalDuration}일로 기간이 연장되었습니다.`);
                extendBtn.style.display = 'none'; 
            } catch (error) {
                console.error("기간 연장 실패:", error);
                alert("기간 연장에 실패했습니다.");
            }
        };
    } else {
        statusDiv.innerText = "영구 보관";
        statusDiv.style.color = "#555";
    }
}

// ★★★ 다중 다운로드 모달 띄우기 (손님 공유 모드 지원) ★★★
function showMultiDownloadModal(data, badgeText, isShare = false) {
    multiDownloadList.innerHTML = '';
    const isPhoto = badgeText === 'PHOTO';
    const urls = Array.isArray(data.content) ? data.content : [data.content];

    const names = Array.isArray(data.originalNames) ? data.originalNames : urls.map((url, i) => {
        const urlParts = url.split('/');
        return urlParts[urlParts.length - 1] || `file_${i + 1}`;
    });

    urls.forEach((url, i) => {
        const li = document.createElement('li');
        li.className = 'multi-download-item';

        let iconHtml = '';
        if (isPhoto) {
            iconHtml = `<img src="${url}" alt="thumbnail">`;
        } else {
            iconHtml = `<span class="material-symbols-outlined">insert_drive_file</span>`;
        }

        const fileName = names[i] || `file_${i + 1}`;

        li.innerHTML = `
            ${iconHtml}
            <span class="multi-download-item-name">${fileName}</span>
            <span class="material-symbols-outlined" style="margin-right: 0; color: #3498db;">download</span>
        `;

        li.addEventListener('click', () => {
            forceDownload(url, fileName);
            li.style.backgroundColor = '#e8f4fd';
            setTimeout(() => li.style.backgroundColor = '', 300);
        });

        multiDownloadList.appendChild(li);
    });

    multiDownloadTitle.innerText = isPhoto ? '사진 목록' : '파일 목록';
    
    // 💡 공유 모드일 때만 저장 버튼 보이기
    const shareActions = document.getElementById('fileShareActions');
    if (shareActions) {
        if (isShare) {
            shareActions.style.display = 'block';
            document.getElementById('saveFileShareBtn').onclick = () => saveSharedCardToMyApp(data);
        } else {
            shareActions.style.display = 'none';
        }
    }

    multiDownloadModal.style.display = 'flex';
}

// ★★★ 메모 보기 모달 띄우기 (손님 공유 모드 지원) ★★★
function showMemoViewModal(data, docId = null, isShare = false) {
    const memoViewModal = document.getElementById('memoViewModal');
    const memoViewTitle = document.getElementById('memoViewTitle');
    const memoViewContent = document.getElementById('memoViewContent');
    const memoViewCopyBtn = document.getElementById('memoViewCopyBtn');
    const memoViewSaveBtn = document.getElementById('memoViewSaveBtn');
    const closeMemoViewBtn = document.getElementById('closeMemoViewBtn');

    memoViewTitle.innerText = data.name || '제목없음';
    memoViewContent.value = data.content;
    
    // 손님 모드이면 내용을 수정하지 못하도록 읽기 전용으로 변경
    memoViewContent.readOnly = isShare;
    memoViewSaveBtn.style.display = isShare ? 'none' : 'block';

    // 💡 공유 모드일 때만 저장 버튼 보이기
    const shareActions = document.getElementById('memoShareActions');
    if (shareActions) {
        if (isShare) {
            shareActions.style.display = 'block';
            document.getElementById('saveMemoShareBtn').onclick = () => saveSharedCardToMyApp(data);
        } else {
            shareActions.style.display = 'none';
        }
    }

    closeMemoViewBtn.onclick = () => {
        memoViewModal.style.display = 'none';
        // 창 닫을 때 손님 모드이면 로그인 창 띄우기
        if (isShare && !auth.currentUser) {
            loginScreen.style.display = 'flex';
        }
    };

    memoViewCopyBtn.onclick = () => {
        navigator.clipboard.writeText(memoViewContent.value).then(() => {
            memoViewCopyBtn.innerText = '복사됨 ✓';
            memoViewCopyBtn.style.background = '#28a745';
            setTimeout(() => {
                memoViewCopyBtn.innerText = '내용 복사';
                memoViewCopyBtn.style.background = '#6c757d';
            }, 1500);
        }).catch(err => console.error('복사 실패:', err));
    };

    if (!isShare) {
        memoViewSaveBtn.onclick = async () => {
            const newContent = memoViewContent.value.trim();
            if (!newContent) return;
            if (newContent === data.content) {
                memoViewModal.style.display = 'none';
                return;
            }

            memoViewSaveBtn.disabled = true;
            memoViewSaveBtn.innerText = '저장 중...';

            try {
                if (docId) {
                    await updateDoc(doc(db, 'cards', docId), { content: newContent });
                }

                data.content = newContent;

                const cardEl = document.querySelector(`.list-card[data-id="${docId}"]`);
                if (cardEl) {
                    const descEl = cardEl.querySelector('.card-desc');
                    if (descEl) descEl.innerText = newContent;
                }

                memoViewSaveBtn.innerText = '저장됨 ✓';
                memoViewSaveBtn.style.background = '#28a745';
                setTimeout(() => {
                    memoViewModal.style.display = 'none';
                    memoViewSaveBtn.innerText = '저장';
                    memoViewSaveBtn.style.background = '#4A90E2';
                    memoViewSaveBtn.disabled = false;
                }, 1000);
            } catch (err) {
                console.error('저장 실패:', err);
                alert('저장에 실패했습니다.');
                memoViewSaveBtn.innerText = '저장';
                memoViewSaveBtn.disabled = false;
            }
        };
    }

    memoViewModal.style.display = 'flex';
}
