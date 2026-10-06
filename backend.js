// Firebase SDK 모듈 임포트
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, updateDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export { auth, db, provider, signInWithPopup, onAuthStateChanged, signOut, collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, updateDoc, setDoc, getDoc };

// Cloudinary 설정 관리 함수 (로컬스토리지 + Firestore 연동)
export function getCloudinaryConfig() {
    try {
        const saved = localStorage.getItem('cloudinary_config');
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                cloudName: (parsed.cloudName || '').trim(),
                uploadPreset: (parsed.uploadPreset || '').trim(),
                apiKey: (parsed.apiKey || '').trim(),
                apiSecret: (parsed.apiSecret || '').trim()
            };
        }
    } catch (e) {
        console.error('Cloudinary 설정 로드 실패:', e);
    }
    return {
        cloudName: '',
        uploadPreset: '',
        apiKey: '',
        apiSecret: ''
    };
}

function normalizeCloudinaryConfig(config = {}) {
    return {
        cloudName: (config.cloudName || '').trim(),
        uploadPreset: (config.uploadPreset || '').trim(),
        apiKey: (config.apiKey || '').trim(),
        apiSecret: (config.apiSecret || '').trim()
    };
}

function hasUploadConfig(config) {
    return Boolean(config && config.cloudName && config.uploadPreset);
}

function getFallbackSettingsRef(uid) {
    return doc(db, 'cards', `app_settings_${uid}`);
}

async function persistCloudinaryConfig(uid, cleanConfig) {
    const updatedAt = Date.now();
    let saved = false;

    // 기존 전용 설정 경로를 계속 지원합니다.
    try {
        await setDoc(
            doc(db, 'user_settings', uid),
            { cloudinary: cleanConfig, updatedAt },
            { merge: true }
        );
        saved = true;
    } catch (e) {
        console.warn('Firestore 전용 설정 경로 저장 실패:', e);
    }

    // cards는 이 앱에서 이미 기기 간 동기화 권한이 확인된 경로입니다.
    // 화면에는 표시하지 않는 계정별 고정 문서로 설정을 한 번 더 보관합니다.
    try {
        await setDoc(getFallbackSettingsRef(uid), {
            uid,
            type: 'app_settings',
            name: 'Cloudinary settings',
            cloudinary: cleanConfig,
            updatedAt,
            uploadTime: updatedAt,
            expirationDays: 'permanent',
            originalDuration: 'permanent',
            status: 'complete'
        });
        saved = true;
    } catch (e) {
        console.warn('Firestore 설정 백업 경로 저장 실패:', e);
    }

    return saved;
}

export async function saveCloudinaryConfig(config, uid = null) {
    const cleanConfig = normalizeCloudinaryConfig(config);
    try {
        localStorage.setItem('cloudinary_config', JSON.stringify(cleanConfig));
    } catch (e) {
        console.error('Cloudinary 로컬 저장 실패:', e);
    }

    if (uid && db) {
        const saved = await persistCloudinaryConfig(uid, cleanConfig);
        if (!saved) {
            console.warn('Firestore 설정 동기화 실패 (로컬 저장은 유지됨)');
        }
    }

    return cleanConfig;
}

export async function syncCloudinaryConfigFromFirestore(uid) {
    if (!uid || !db) return getCloudinaryConfig();

    const localConfig = getCloudinaryConfig();
    const remoteCandidates = [];

    try {
        const docRef = doc(db, 'user_settings', uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().cloudinary) {
            remoteCandidates.push({
                config: normalizeCloudinaryConfig(docSnap.data().cloudinary),
                updatedAt: Number(docSnap.data().updatedAt) || 0
            });
        }
    } catch (e) {
        console.warn('Firestore 전용 설정 경로 불러오기 실패:', e);
    }

    try {
        const fallbackSnap = await getDoc(getFallbackSettingsRef(uid));
        if (fallbackSnap.exists() && fallbackSnap.data().cloudinary) {
            remoteCandidates.push({
                config: normalizeCloudinaryConfig(fallbackSnap.data().cloudinary),
                updatedAt: Number(fallbackSnap.data().updatedAt) || 0
            });
        }
    } catch (e) {
        console.warn('Firestore 설정 백업 경로 불러오기 실패:', e);
    }

    const newestRemote = remoteCandidates
        .filter(candidate => hasUploadConfig(candidate.config))
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];

    if (newestRemote) {
        const merged = normalizeCloudinaryConfig({
            cloudName: newestRemote.config.cloudName || localConfig.cloudName,
            uploadPreset: newestRemote.config.uploadPreset || localConfig.uploadPreset,
            apiKey: newestRemote.config.apiKey || localConfig.apiKey,
            apiSecret: newestRemote.config.apiSecret || localConfig.apiSecret
        });
        localStorage.setItem('cloudinary_config', JSON.stringify(merged));
        await persistCloudinaryConfig(uid, merged);
        return merged;
    }

    if (hasUploadConfig(localConfig)) {
        // 기존 기기의 로컬 설정을 새 계정 백업 경로로 자동 이전합니다.
        await persistCloudinaryConfig(uid, localConfig);
    }

    return getCloudinaryConfig();
}

export async function sha1(str) {
    const buffer = new TextEncoder("utf-8").encode(str);
    const digest = await crypto.subtle.digest("SHA-1", buffer);
    return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function deleteCloudinaryFile(publicId, resourceType = 'image') {
    const config = getCloudinaryConfig();
    const { cloudName, apiKey, apiSecret } = config;

    if (!cloudName || !apiKey || !apiSecret) {
        console.warn("Cloudinary 설정(Cloud Name, API Key, API Secret)이 설정되지 않아 삭제할 수 없습니다.");
        return;
    }

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
        await fetch(url, { method: 'POST', body: formData });
    } catch (error) {
        console.error("Cloudinary 삭제 실패:", error);
    }
}
