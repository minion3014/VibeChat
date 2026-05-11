/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  db, 
  auth, 
  signOut, 
  onAuthStateChanged, 
  User as AuthUser,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  where,
  Timestamp,
  deleteDoc,
  getDocs,
  writeBatch,
  updateDoc,
  arrayRemove,
  arrayUnion
} from './lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Send, LogOut, MessageCircle, MessageSquare, User as UserIcon, Loader2, Plus, Users, X, Info, MoreVertical, Trash2, Menu, UserPlus, Camera, Settings, Edit2, Eye, EyeOff } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

// --- Types ---
interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  createdAt: Timestamp | null;
  isDeleted?: boolean;
  type?: 'text' | 'system';
}

interface Chat {
  id: string;
  name?: string;
  photoURL?: string;
  type: 'private' | 'group';
  members: string[];
  lastMessage?: string;
  updatedAt: Timestamp | null;
  lastReadAt?: { [uid: string]: Timestamp };
}

interface User {
  id: string;
  displayName: string;
  photoURL?: string;
  email?: string;
  isOnline?: boolean;
  lastSeen?: Timestamp | null;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

// --- Error Handler ---
function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // In a real app, you might show a toast here
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  // Email Auth State
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Chat/Search State
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [myChats, setMyChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Group creation state
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showGroupSettingsModal, setShowGroupSettingsModal] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupPhoto, setEditGroupPhoto] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false);
  const chatMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    show: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Auth State ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAdmin(currentUser?.email === 'minion3014@gmail.com');
      setLoading(false);

      if (currentUser) {
        // Sync user profile to Firestore
        const userRef = doc(db, 'users', currentUser.uid);
        try {
          const userDoc = await getDoc(userRef);
          const userData = userDoc.data();
          
          const profileUpdates: any = {
            displayName: currentUser.displayName || userData?.displayName || 'Anonymous',
            email: currentUser.email || userData?.email || '',
            lastSeen: serverTimestamp(),
            isOnline: true
          };

          // Only sync photoURL from auth if it's not empty, 
          // or if firestore doesn't have one yet.
          if (currentUser.photoURL) {
            profileUpdates.photoURL = currentUser.photoURL;
          } else if (!userData?.photoURL) {
            profileUpdates.photoURL = '';
          }

          await setDoc(userRef, profileUpdates, { merge: true });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      }
    });

    if (user) {
      const userRef = doc(db, 'users', user.uid);
      const handleOffline = () => {
        updateDoc(userRef, { 
          isOnline: false, 
          lastSeen: serverTimestamp() 
        }).catch(e => console.error(e));
      };
      
      window.addEventListener('beforeunload', handleOffline);
      return () => {
        window.removeEventListener('beforeunload', handleOffline);
        handleOffline();
        unsubscribe();
      };
    }

    return () => unsubscribe();
  }, [user?.uid]);

  // --- Fetch Users ---
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllUsers(usersList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    return () => unsubscribe();
  }, [user]);

  // --- Fetch My Chats ---
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'chats'),
      where('members', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatsList = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Chat));
      setMyChats(chatsList);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'chats'));
    return () => unsubscribe();
  }, [user]);

  // --- Real-time Messages ---
  useEffect(() => {
    if (!user || !activeChatId) {
      setMessages([]);
      return;
    }

    const messagesRef = collection(db, 'chats', activeChatId, 'messages');
    const q = query(
      messagesRef,
      orderBy('createdAt', 'desc'),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(msgs.reverse());
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${activeChatId}/messages`);
    });

    return () => unsubscribe();
  }, [user, activeChatId]);

  // --- Mark chat as read ---
  useEffect(() => {
    if (!user || !activeChatId) return;

    const markAsRead = async () => {
      try {
        const chatRef = doc(db, 'chats', activeChatId);
        await setDoc(chatRef, {
          lastReadAt: {
            [user.uid]: serverTimestamp()
          }
        }, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `chats/${activeChatId}`);
      }
    };

    markAsRead();
  }, [user, activeChatId]);

  // --- Click Outside Handler ---
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Handle Chat Menu
      if (showChatMenu && chatMenuRef.current && !chatMenuRef.current.contains(event.target as Node)) {
        setShowChatMenu(false);
      }
      // Handle Search Dropdown
      if (searchQuery && searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchQuery('');
      }
      // Handle Mobile Sidebar
      if (showMobileSidebar && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        // Only auto-hide sidebar if it's currently displayed in mobile mode (not desktop always-on)
        if (window.innerWidth < 768) {
          setShowMobileSidebar(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showChatMenu, showMobileSidebar]);

  // --- Auto Scroll ---
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // --- Actions ---
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    if (isRegistering && password !== confirmPassword) {
      setAuthError('Mật khẩu nhập lại không khớp');
      setAuthLoading(false);
      return;
    }

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: displayName });
        const userRef = doc(db, 'users', userCredential.user.uid);
        await setDoc(userRef, {
          displayName: displayName,
          email: email,
          photoURL: '',
          lastSeen: serverTimestamp(),
          isOnline: true
        }, { merge: true });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      setAuthError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
          isOnline: false,
          lastSeen: serverTimestamp()
        });
      }
      await signOut(auth);
      setMessages([]);
      setActiveChatId(null);
      setPassword('');
      setIsRegistering(false);
    } catch (error: any) {
      console.error("Logout Error:", error.message);
    }
  };

  const handleUpdateProfile = async () => {
    if (!user || !profileName.trim()) return;
    setIsUpdatingProfile(true);
    try {
      // Firebase Auth photoURL has a limit (around 2048 characters).
      // Data URLs (base64) are often much longer. We skip updating Auth photoURL if it's a long string,
      // but we still update Firestore which supports larger strings.
      const isPhotoTooLongForAuth = profilePhoto && profilePhoto.length > 2000;
      
      await updateProfile(user, {
        displayName: profileName,
        photoURL: isPhotoTooLongForAuth ? (user.photoURL || '') : profilePhoto
      });
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: profileName,
        photoURL: profilePhoto,
        updatedAt: serverTimestamp()
      });
      
      setShowProfileModal(false);
    } catch (error: any) {
      console.error("Profile Update Error:", error.message);
      setAuthError(error.message);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'user' | 'group') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === 'user') {
          setProfilePhoto(reader.result as string);
        } else {
          setEditGroupPhoto(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateGroup = async () => {
    if (!activeChat || !editGroupName.trim()) return;
    setIsUpdatingGroup(true);
    try {
      const chatRef = doc(db, 'chats', activeChat.id);
      await updateDoc(chatRef, {
        name: editGroupName,
        photoURL: editGroupPhoto,
        updatedAt: serverTimestamp()
      });
      setShowGroupSettingsModal(false);
    } catch (error: any) {
      console.error("Group Update Error:", error.message);
      setAuthError(error.message);
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !activeChatId || sending) return;

    setSending(true);
    const textMsg = newMessage.trim();
    const messageData = {
      text: textMsg,
      senderId: user.uid,
      senderName: user.displayName || 'Anonymous',
      senderPhoto: user.photoURL || '',
      type: 'text',
      createdAt: serverTimestamp()
    };

    try {
      const msgRef = collection(db, 'chats', activeChatId, 'messages');
      await addDoc(msgRef, messageData);
      await setDoc(doc(db, 'chats', activeChatId), {
        lastMessage: textMsg,
        updatedAt: serverTimestamp(),
        lastReadAt: {
          [user.uid]: serverTimestamp()
        }
      }, { merge: true });
      setNewMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `chats/${activeChatId}/messages`);
    } finally {
      setSending(false);
    }
  };

  const sendSystemMessage = async (chatId: string, text: string) => {
    try {
      const msgRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(msgRef, {
        text,
        senderId: 'system',
        senderName: 'System',
        type: 'system',
        createdAt: serverTimestamp()
      });
      await setDoc(doc(db, 'chats', chatId), {
        lastMessage: text,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `chats/${chatId}/messages`);
    }
  };

  const startPrivateChat = async (otherUser: any) => {
    if (!user) return;
    
    const chatId = [user.uid, otherUser.id].sort().join('_');
    
    try {
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(chatRef, {
        members: [user.uid, otherUser.id],
        type: 'private',
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      setActiveChatId(chatId);
      setSearchQuery('');
      setShowMobileSidebar(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}`);
    }
  };

  const createGroup = async () => {
    if (!user || !groupName.trim() || selectedUsers.length === 0) return;
    
    const members = [...selectedUsers, user.uid];
    const chatId = 'group_' + Date.now();
    
    try {
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(chatRef, {
        name: groupName.trim(),
        members: members,
        type: 'group',
        updatedAt: serverTimestamp()
      });
      
      await sendSystemMessage(chatId, `${user.displayName || 'Người dùng'} đã tạo nhóm "${groupName.trim()}"`);
      
      setActiveChatId(chatId);
      setShowCreateGroup(false);
      setGroupName('');
      setSelectedUsers([]);
      setShowMobileSidebar(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `chats/${chatId}`);
    }
  };

  const deleteChat = async () => {
    if (!activeChatId || !user) return;
    
    const isGroup = activeChat?.type === 'group';

    setConfirmModal({
      show: true,
      title: isGroup ? 'Rời khỏi nhóm' : 'Xóa cuộc trò chuyện',
      message: isGroup 
        ? 'Bạn có chắc chắn muốn rời khỏi nhóm này?' 
        : 'Bạn có chắc chắn muốn xóa cuộc trò chuyện này và toàn bộ lịch sử tin nhắn?',
      onConfirm: async () => {
        try {
          if (isGroup) {
            const chatIdToLeave = activeChatId;
            // Clear activeChatId first to unsubscribe listeners before permissions are revoked
            setActiveChatId(null);
            setShowChatMenu(false);
            
            // Add system message while user still has permissions (using the local chatIdToLeave)
            await sendSystemMessage(chatIdToLeave, `${user.displayName || 'Người dùng'} đã rời khỏi nhóm`);

            // Then remove the user from members list
            await updateDoc(doc(db, 'chats', chatIdToLeave), {
              members: arrayRemove(user.uid),
              updatedAt: serverTimestamp()
            });
          } else {
            // Logic for private chat: Delete the whole document
            const chatIdToDelete = activeChatId;
            setActiveChatId(null);
            await clearHistory(false);
            await deleteDoc(doc(db, 'chats', chatIdToDelete));
          }
          
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `chats/${activeChatId || 'unknown'}`);
        }
      }
    });
  };

  const clearHistory = async (showConfirm = true) => {
    if (!activeChatId) return;

    if (showConfirm) {
      setConfirmModal({
        show: true,
        title: 'Xóa lịch sử tin nhắn',
        message: 'Bạn có chắc chắn muốn xóa tất cả lịch sử tin nhắn trong cuộc trò chuyện này?',
        onConfirm: async () => {
          await executeClearHistory();
          setConfirmModal(prev => ({ ...prev, show: false }));
        }
      });
      return;
    }

    await executeClearHistory();
  };

  const executeClearHistory = async () => {
    if (!activeChatId) return;
    try {
      const messagesRef = collection(db, 'chats', activeChatId, 'messages');
      const messagesSnapshot = await getDocs(messagesRef);
      
      let batch = writeBatch(db);
      let count = 0;
      for (const mDoc of messagesSnapshot.docs) {
        batch.delete(mDoc.ref);
        count++;
        if (count === 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) await batch.commit();

      // Reset last message in chat preview
      await setDoc(doc(db, 'chats', activeChatId), {
        lastMessage: '',
        updatedAt: serverTimestamp()
      }, { merge: true });

      setShowChatMenu(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chats/${activeChatId}/messages`);
    }
  };

  const clearAllAppMetadata = async () => {
    if (!isAdmin) return;
    
    setConfirmModal({
      show: true,
      title: 'DỌN DẸP TOÀN BỘ HỆ THỐNG',
      message: 'CẢNH BÁO: Hành động này sẽ xóa VĨNH VIỄN tất cả các cuộc trò chuyện và tin nhắn trên toàn bộ hệ thống. Bạn có chắc chắn muốn tiếp tục?',
      onConfirm: async () => {
        try {
          // 1. Get all chats
          const chatsSnapshot = await getDocs(collection(db, 'chats'));
          
          for (const chatDoc of chatsSnapshot.docs) {
            // 2. Get all messages in each chat
            const messagesSnapshot = await getDocs(collection(db, 'chats', chatDoc.id, 'messages'));
            let batch = writeBatch(db);
            let count = 0;
            for (const mDoc of messagesSnapshot.docs) {
              batch.delete(mDoc.ref);
              count++;
              if (count === 500) {
                await batch.commit();
                batch = writeBatch(db);
                count = 0;
              }
            }
            if (count > 0) await batch.commit();
            
            // 3. Delete the chat document itself
            await deleteDoc(chatDoc.ref);
          }
          
          setActiveChatId(null);
          setConfirmModal(prev => ({ ...prev, show: false }));
          alert('Đã dọn dẹp toàn bộ dữ liệu thành công.');
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, 'all_data');
        }
      }
    });
  };

  const deleteMessage = async (messageId: string) => {
    if (!activeChatId) return;
    
    setConfirmModal({
      show: true,
      title: 'Xóa tin nhắn',
      message: 'Bạn có chắc chắn muốn xóa tin nhắn này không?',
      onConfirm: async () => {
        try {
          const msgRef = doc(db, 'chats', activeChatId, 'messages', messageId);
          await setDoc(msgRef, {
            text: 'Tin nhắn này đã xóa',
            isDeleted: true,
            updatedAt: serverTimestamp()
          }, { merge: true });
          setConfirmModal(prev => ({ ...prev, show: false }));
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `chats/${activeChatId}/messages/${messageId}`);
        }
      }
    });
  };

  const toggleUserSelection = (uid: string) => {
    setSelectedUsers(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  // --- Filtering ---
  const currentUserData = allUsers.find(u => u.id === user?.uid);
  const myUsers = allUsers.filter(u => u.id !== user?.uid);
  const filteredUsers = searchQuery.trim() 
    ? myUsers.filter(u => {
        const query = searchQuery.toLowerCase();
        const emailLocalPart = u.email?.split('@')[0].toLowerCase() || '';
        return (
          u.displayName?.toLowerCase().includes(query) || 
          emailLocalPart.includes(query)
        );
      })
    : [];

  // Filter users for group creation based on search query
  const filteredGroupUsers = groupSearchQuery.trim() === '' 
    ? [] 
    : myUsers.filter(u => {
        const query = groupSearchQuery.toLowerCase();
        const emailLocalPart = u.email?.split('@')[0].toLowerCase() || '';
        return (
          u.displayName?.toLowerCase().includes(query) || 
          emailLocalPart.includes(query)
        );
      });

  const activeChat = myChats.find(c => c.id === activeChatId);
  const activeChatPartner = activeChat?.type === 'private' 
    ? allUsers.find(u => activeChat.members.find(m => m !== user?.uid) === u.id) 
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[100dvh] bg-[#020408]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] bg-[#020408] p-4 relative overflow-hidden">
        {/* Background Atmosphere */}
        <div className="absolute inset-0">
          <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-600/10 blur-[120px]"></div>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 bg-white/[0.02] backdrop-blur-3xl rounded-3xl shadow-2xl border border-white/5 text-center z-10"
        >
          <div className="flex items-center justify-center gap-3 mb-8 group relative">
            {/* Subtle background glow */}
            <div className="absolute inset-0 bg-blue-600/10 blur-3xl rounded-full -z-10 group-hover:bg-blue-600/20 transition-colors duration-500"></div>
            
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-2xl shadow-blue-500/30 group-hover:scale-105 transition-transform duration-500 shrink-0">
              <MessageCircle className="w-7 h-7 text-white fill-white" />
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white uppercase">
              VIBECHAT
            </h1>
          </div>
          <p className="text-slate-400 mb-8 text-sm">{isRegistering ? 'Tạo tài khoản mới' : 'Đăng nhập để tiếp tục'}</p>
          
          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            {isRegistering && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Tên hiển thị"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-base focus:outline-none focus:border-blue-500/50 transition-all text-white"
                />
              </div>
            )}
            <div className="relative">
                  <input
                    type="email"
                    placeholder="Email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-base focus:outline-none focus:border-blue-500/50 transition-all text-white"
                  />
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Mật khẩu"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-base focus:outline-none focus:border-blue-500/50 transition-all text-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/5 rounded-lg text-slate-500 hover:text-slate-300 transition-all"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {isRegistering && (
              <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Nhập lại mật khẩu"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-base focus:outline-none focus:border-blue-500/50 transition-all text-white"
              />
              <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-white/5 rounded-lg text-slate-500 hover:text-slate-300 transition-all"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            )}

            {authError && <p className="text-red-400 text-xs mt-2">{authError}</p>}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-3 py-3 px-6 bg-blue-600 rounded-xl hover:bg-blue-500 transition-all shadow-lg text-white font-semibold disabled:opacity-50"
            >
              {authLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isRegistering ? 'Đăng ký' : 'Đăng nhập')}
            </button>
          </form>

          <p className="text-slate-400 text-sm">
            {isRegistering ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'} {' '}
            <button 
              onClick={() => {
                setIsRegistering(!isRegistering);
                setAuthError('');
                setConfirmPassword('');
              }}
              className="text-blue-400 hover:underline font-medium"
            >
              {isRegistering ? 'Đăng nhập ngay' : 'Tham gia ngay'}
            </button>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#020408] text-slate-100 flex overflow-hidden font-sans">
      {/* Background Atmosphere */}
      <div className="absolute inset-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/10 blur-[120px]"></div>
      </div>

      {/* Sidebar: Conversations */}
      <div 
        ref={sidebarRef}
        className={`${showMobileSidebar ? 'flex' : 'hidden'} md:flex fixed md:relative inset-0 md:inset-auto w-[280px] sm:w-[320px] md:w-[320px] h-full border-r border-white/5 bg-[#020408]/95 md:bg-white/[0.02] backdrop-blur-2xl flex-col z-50 md:z-10 transition-all shadow-2xl md:shadow-none`}
      >
        <div className="p-6 flex items-center justify-between border-b border-white/5 md:border-none">
          <div className="flex items-center gap-3 group cursor-default relative">
            {/* Subtle sidebar logo glow */}
            <div className="absolute -inset-2 bg-blue-600/5 blur-xl rounded-full -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform duration-300 shrink-0">
              <MessageCircle className="w-5 h-5 text-white fill-white" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-white uppercase">
              VIBECHAT
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowCreateGroup(true)}
              className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-blue-500/20 hover:border-blue-500/30 transition-all duration-300 group"
              title="Tạo nhóm"
            >
              <Plus className="w-4 h-4 text-slate-400 group-hover:text-blue-400" />
            </button>
            <button 
              onClick={() => setShowMobileSidebar(false)}
              className="md:hidden w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-4 mb-4 relative" ref={searchRef}>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Tìm bạn bè hoặc Email..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-base focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-600 text-white"
            />
          </div>

          {/* Search Results Dropdown */}
          <AnimatePresence>
            {searchQuery.trim() !== '' && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-4 right-4 mt-2 bg-[#0d1117] border border-white/10 rounded-2xl shadow-2xl z-[60] overflow-hidden max-h-[400px] flex flex-col"
              >
                <div className="py-2 px-4 text-[10px] uppercase font-bold text-blue-400 tracking-widest border-b border-white/5 bg-white/[0.02]">Kết quả tìm kiếm</div>
                <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map(u => (
                      <div 
                        key={u.id}
                        onClick={() => startPrivateChat(u)}
                        className="p-3 hover:bg-blue-600/10 rounded-xl flex items-center gap-3 cursor-pointer group transition-all border border-transparent hover:border-blue-500/20"
                      >
                        <div className="relative shrink-0">
                          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-500 border border-white/5 overflow-hidden">
                            {u.photoURL ? <img src={u.photoURL} alt="" className="w-full h-full object-cover" /> : u.displayName?.substring(0, 2).toUpperCase()}
                          </div>
                          {u.isOnline && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d1117] shadow-sm"></div>
                          )}
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-sm font-semibold truncate group-hover:text-blue-400">{u.displayName}</p>
                          <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-600">Không tìm thấy người dùng phù hợp</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Chat List */}
        <div className="flex-1 space-y-1 px-2 overflow-y-auto custom-scrollbar">
          <div className="py-2 px-4 text-[10px] uppercase font-bold text-slate-600 tracking-widest font-sans">Cuộc trò chuyện</div>
          
          {myChats.length > 0 ? (
            myChats.map((c) => {
                  const isGroup = c.type === 'group';
                  const partnerId = c.members.find(m => m !== user?.uid);
                  const partner = !isGroup ? allUsers.find(u => u.id === partnerId) : null;
                  const chatName = isGroup ? c.name : (partner?.displayName || 'Đang tải...');
                  
                  // Only show chats with history (lastMessage) or group chats
                  if (!isGroup && !c.lastMessage) return null;

                  const lastRead = c.lastReadAt?.[user.uid];
                  const hasUnread = c.updatedAt && (!lastRead || c.updatedAt.toMillis() > lastRead.toMillis());

                  return (
                    <div 
                      key={c.id}
                      onClick={() => {
                        setActiveChatId(c.id);
                        setShowMobileSidebar(false);
                      }}
                      className={`p-3 rounded-2xl flex items-center gap-3 transition-all cursor-pointer group border ${
                        activeChatId === c.id 
                          ? 'bg-blue-600/10 border-blue-500/20 shadow-inner' 
                          : hasUnread 
                            ? 'bg-white/[0.03] border-white/10' 
                            : 'hover:bg-white/5 border-transparent'
                      }`}
                    >
                      <div className="relative">
                        {isGroup ? (
                          <div className="w-11 h-11 rounded-xl bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-indigo-400 overflow-hidden">
                            {c.photoURL ? (
                              <img src={c.photoURL} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Users className="w-5 h-5" />
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="w-11 h-11 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-500 border border-white/10 overflow-hidden">
                              {partner?.photoURL ? (
                                <img src={partner.photoURL} alt="" className="w-full h-full object-cover" />
                              ) : (
                                chatName?.substring(0, 2).toUpperCase()
                              )}
                            </div>
                            {partner?.isOnline && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#020408] shadow-lg"></div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className={`text-sm truncate ${hasUnread && activeChatId !== c.id ? 'font-bold text-white' : 'font-semibold text-slate-300'}`}>{chatName}</span>
                          {c.updatedAt && (
                            <span className={`text-[9px] ${hasUnread && activeChatId !== c.id ? 'text-blue-400 font-bold' : 'text-slate-600'}`}>{format(c.updatedAt.toDate(), 'HH:mm')}</span>
                          )}
                        </div>
                        <div className="flex justify-between items-center gap-2">
                          <p className={`text-xs truncate transition-colors font-sans flex-1 ${hasUnread && activeChatId !== c.id ? 'text-slate-200 font-medium' : 'text-slate-500'}`}>
                            {c.lastMessage || 'Bắt đầu chat...'}
                          </p>
                          {hasUnread && activeChatId !== c.id && (
                            <div className="w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.5)] shrink-0"></div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center flex flex-col items-center gap-2 mt-10">
                  <Info className="w-8 h-8 text-slate-700 opacity-20" />
                  <p className="text-[11px] text-slate-600 font-medium">Bạn chưa có cuộc trò chuyện nào</p>
                  <p className="text-[10px] text-slate-700">Hãy tìm kiếm bạn bè để bắt đầu</p>
                </div>
              )}
        </div>
        
        {/* Profile */}
        <div className="p-4 border-t border-white/5 bg-white/[0.01] flex items-center gap-3">
          <div 
            className="relative cursor-pointer group"
            onClick={() => {
              setProfileName(currentUserData?.displayName || user.displayName || '');
              setProfilePhoto(currentUserData?.photoURL || user.photoURL || '');
              setShowProfileModal(true);
            }}
          >
            {(currentUserData?.photoURL || user.photoURL) ? (
              <img src={currentUserData?.photoURL || user.photoURL} alt="" className="w-10 h-10 rounded-xl border border-white/10 object-cover group-hover:opacity-50 transition-opacity" />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xs font-bold text-blue-400 group-hover:bg-white/20 transition-all">
                {(currentUserData?.displayName || user.displayName)?.substring(0, 1).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#020408]"></div>
          </div>
          <div 
            className="flex-1 overflow-hidden cursor-pointer"
            onClick={() => {
              setProfileName(currentUserData?.displayName || user.displayName || '');
              setProfilePhoto(currentUserData?.photoURL || user.photoURL || '');
              setShowProfileModal(true);
            }}
          >
            <p className="text-sm font-semibold truncate hover:text-blue-400 transition-colors">{currentUserData?.displayName || user.displayName}</p>
            <p className="text-[10px] text-green-400 uppercase tracking-widest font-bold">Online</p>
          </div>
          {isAdmin && (
            <button
              onClick={clearAllAppMetadata}
              className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-all mr-1"
              title="Dọn dẹp hệ thống"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleLogout}
            className="p-2 text-slate-600 hover:text-red-400 hover:bg-white/5 rounded-xl transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 min-h-0 flex flex-col z-10 overflow-hidden relative">
        {/* Chat Header */}
        <header className="h-20 flex-shrink-0 border-b border-white/5 flex items-center justify-between px-4 sm:px-8 bg-slate-900/50 backdrop-blur-md relative z-40">
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <button 
              onClick={() => setShowMobileSidebar(true)}
              className="md:hidden w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all shrink-0"
            >
              <Menu className="w-5 h-5 text-blue-400" />
            </button>
            <div className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl border border-white/10 shrink-0 flex items-center justify-center overflow-hidden transition-all ${activeChatId ? 'bg-blue-500/10' : 'bg-white/5'}`}>
              {activeChat ? (
                activeChat.type === 'group' ? (
                  activeChat.photoURL ? (
                    <img src={activeChat.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs uppercase">
                      {activeChat.name.substring(0, 2)}
                    </div>
                  )
                ) : (
                  <>
                    {activeChatPartner?.photoURL ? (
                      <img src={activeChatPartner.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs uppercase">
                        {activeChatPartner?.displayName?.substring(0, 2) || <MessageCircle className="w-5 h-5" />}
                      </div>
                    )}
                  </>
                )
              ) : (
                (currentUserData?.photoURL || user?.photoURL) ? (
                  <img src={currentUserData?.photoURL || user?.photoURL} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-white/5 flex items-center justify-center text-slate-400 font-bold text-xs uppercase">
                    {(currentUserData?.displayName || user?.displayName)?.substring(0, 2) || <MessageCircle className="w-5 h-5" />}
                  </div>
                )
              )}
              {activeChat?.type !== 'group' && activeChatPartner?.isOnline && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-slate-900 shadow-xl"></div>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-bold tracking-tight truncate text-white">
                {activeChat ? (activeChat.type === 'group' ? activeChat.name : (activeChatPartner?.displayName || 'Trò chuyện')) : 'VibeChat'}
              </h2>
              <div className="flex items-center gap-2 text-[9px] sm:text-[11px] font-medium font-sans uppercase tracking-wider truncate">
                {activeChat ? (
                  activeChat.type === 'group' ? (
                    <span className="text-slate-500">{activeChat.members.length} thành viên</span>
                  ) : (
                    activeChatPartner?.isOnline ? (
                      <span className="text-green-400 flex items-center gap-1.5 ring-green-400/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                        Đang hoạt động
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        {activeChatPartner?.lastSeen 
                          ? `Đã hoạt động ${formatDistanceToNow(activeChatPartner.lastSeen.toDate(), { addSuffix: true, locale: vi })}`
                          : 'Ngoại tuyến'}
                      </span>
                    )
                  )
                ) : (
                  <span className="text-slate-500">Chọn một cuộc trò chuyện</span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex gap-4 relative" ref={chatMenuRef}>
            {activeChatId && (
              <>
                <button 
                  onClick={() => setShowChatMenu(!showChatMenu)}
                  className={`w-10 h-10 rounded-xl border transition-all flex items-center justify-center ${showChatMenu ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' : 'border-white/10 text-slate-500 hover:text-white hover:bg-white/5'}`}
                >
                  <MoreVertical className="w-5 h-5" />
                </button>
                <AnimatePresence>
                  {showChatMenu && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 top-12 w-64 bg-[#0a0d14] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                          <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-3">Thông tin</p>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20 font-bold overflow-hidden shrink-0">
                              {activeChat?.type === 'group' ? (
                                activeChat.photoURL ? (
                                  <img src={activeChat.photoURL} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Users className="w-5 h-5" />
                                )
                              ) : (
                                activeChatPartner?.photoURL ? (
                                  <img src={activeChatPartner.photoURL} className="w-full h-full object-cover" alt="" />
                                ) : (
                                  activeChatPartner?.displayName?.substring(0, 2).toUpperCase() || '?'
                                )
                              )}
                            </div>
                            <div className="flex-1 overflow-hidden text-left">
                              <p className="text-sm font-semibold truncate text-white">
                                {activeChat?.type === 'group' ? activeChat.name : activeChatPartner?.displayName}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate lowercase">
                                {activeChat?.type === 'group' ? `${activeChat.members.length} thành viên` : activeChatPartner?.email}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="p-2 space-y-1">
                          {activeChat?.type === 'group' && (
                            <>
                              <button 
                                onClick={() => {
                                  setEditGroupName(activeChat.name);
                                  setEditGroupPhoto(activeChat.photoURL || '');
                                  setShowGroupSettingsModal(true);
                                  setShowChatMenu(false);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 text-slate-300 hover:bg-white/5 rounded-xl transition-all text-sm group"
                              >
                                <Settings className="w-4 h-4 text-blue-400" />
                                <span className="font-medium">Cài đặt nhóm</span>
                              </button>
                              <button 
                                onClick={() => {
                                  setShowMembersModal(true);
                                  setShowChatMenu(false);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 text-slate-300 hover:bg-white/5 rounded-xl transition-all text-sm group"
                              >
                                <Users className="w-4 h-4 text-indigo-400" />
                                <span className="font-medium">Xem thành viên</span>
                              </button>
                              <button 
                                onClick={() => {
                                  setShowAddMemberModal(true);
                                  setShowChatMenu(false);
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2 text-slate-300 hover:bg-white/5 rounded-xl transition-all text-sm group"
                              >
                                <UserPlus className="w-4 h-4 text-indigo-400" />
                                <span className="font-medium">Thêm thành viên</span>
                              </button>
                            </>
                          )}
                          <button 
                            onClick={deleteChat}
                            className="w-full flex items-center gap-3 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-xl transition-all text-sm group"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span className="font-medium">{activeChat?.type === 'group' ? 'Rời khỏi nhóm' : 'Xóa cuộc trò chuyện'}</span>
                          </button>
                        </div>
                      </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        </header>

        {/* Message History */}
        <div 
          ref={scrollRef}
          className="flex-1 min-h-0 px-4 sm:px-8 py-6 space-y-6 overflow-y-auto bg-gradient-to-b from-transparent to-blue-900/5 scroll-smooth"
        >
          <div className="w-full space-y-6">
            {!activeChatId ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-700">
                <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-4 border border-white/5">
                  <MessageCircle className="w-10 h-10 opacity-20" />
                </div>
                <p className="text-sm font-medium">Chọn một cuộc trò chuyện phía bên trái để nhắn tin.</p>
                <p className="text-[11px] text-slate-600 mt-2 uppercase tracking-widest">Tin nhắn được mã hóa & bảo mật</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-600">
                <MessageCircle className="w-16 h-16 mb-4 opacity-10" />
                <p className="text-sm">Hãy bắt đầu cuộc trò chuyện bằng cách gửi một tin nhắn.</p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <MessageBubble 
                    key={msg.id} 
                    message={msg} 
                    currentUserId={user.uid} 
                    isAdmin={isAdmin}
                    onDelete={deleteMessage} 
                    allUsers={allUsers} 
                  />
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* Message Input */}
        <div className="flex-shrink-0 p-4 sm:p-6 md:p-8 bg-slate-900/50 border-t border-white/5 backdrop-blur-xl relative z-40 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 md:pb-8">
          <form 
            onSubmit={sendMessage}
            className="w-full max-w-4xl mx-auto relative flex items-center gap-2 sm:gap-4"
          >
            <div className="flex-1 min-w-0 relative">
              <input 
                type="text" 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={activeChatId ? "Nhập tin nhắn..." : "Vui lòng chọn chat"}
                disabled={!activeChatId}
                className="w-full h-12 bg-white/[0.03] border border-white/10 rounded-2xl px-6 text-base focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all text-slate-200 placeholder:text-slate-600 disabled:opacity-40 backdrop-blur-md shadow-inner"
              />
            </div>
            
            <button 
              type="submit"
              disabled={!newMessage.trim() || sending || !activeChatId}
              className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 disabled:bg-slate-800 disabled:opacity-50 transition-all flex-shrink-0 group active:scale-95 border-t border-white/20"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              ) : (
                <Send className="w-5 h-5 text-white transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Create Group Modal */}
      <AnimatePresence>
        {showCreateGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0a0d14] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-lg font-bold">Tạo nhóm mới</h3>
                <button onClick={() => setShowCreateGroup(false)} className="p-2 hover:bg-white/5 rounded-xl text-slate-400"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-600 tracking-widest block mb-2">Tên nhóm</label>
                    <input 
                      type="text" 
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="Tên nhóm của bạn..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-base focus:outline-none focus:border-blue-500/50 text-white"
                    />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-600 tracking-widest block mb-2">Thành viên ({selectedUsers.length})</label>
                  
                  <div className="mb-4">
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="Tìm bạn bè để thêm..." 
                        value={groupSearchQuery}
                        onChange={(e) => setGroupSearchQuery(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl py-2 px-4 text-base focus:outline-none focus:border-blue-500/50 text-white transition-all"
                      />
                    </div>
                  </div>

                  <div className="max-h-[200px] overflow-y-auto custom-scrollbar space-y-2">
                    {filteredGroupUsers.length > 0 ? (
                      filteredGroupUsers.map(u => (
                        <div 
                          key={u.id}
                          onClick={() => toggleUserSelection(u.id)}
                          className={`p-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all ${selectedUsers.includes(u.id) ? 'bg-blue-600/10 border border-blue-500/20' : 'bg-white/5 border border-transparent hover:border-white/10'}`}
                        >
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold font-sans overflow-hidden">
                            {u.photoURL ? <img src={u.photoURL} alt="" className="w-full h-full object-cover" /> : u.displayName?.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <p className="text-xs font-medium truncate">{u.displayName}</p>
                            <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                          </div>
                          {selectedUsers.includes(u.id) && <div className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.5)]"></div>}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                        {groupSearchQuery.trim() !== '' ? 'Không tìm thấy người dùng' : 'Hãy tìm kiếm thành viên'}
                      </div>
                    )}
                  </div>

                  {/* Hiển thị danh sách đã chọn */}
                  {selectedUsers.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedUsers.map(uid => {
                        const u = allUsers.find(user => user.id === uid);
                        return (
                          <div key={uid} className="flex items-center gap-2 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[10px] font-bold text-blue-400">
                            {u?.displayName}
                            <button onClick={(e) => { e.stopPropagation(); toggleUserSelection(uid); }} className="hover:text-white">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="p-6 bg-white/[0.01] border-t border-white/5">
                <button 
                  onClick={createGroup}
                  disabled={!groupName.trim() || selectedUsers.length === 0}
                  className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-all disabled:opacity-50"
                >
                  Tạo nhóm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Members Modal */}
      <MembersModal 
        show={showMembersModal}
        onClose={() => setShowMembersModal(false)}
        members={activeChat?.members || []}
        allUsers={allUsers}
        currentUserId={user.uid}
        onStartChat={startPrivateChat}
      />

      {/* Add Member Modal */}
      <AddMemberModal 
        show={showAddMemberModal}
        onClose={() => setShowAddMemberModal(false)}
        currentMembers={activeChat?.members || []}
        allUsers={allUsers}
        onAddMembers={async (uids) => {
          if (!activeChatId) return;
          try {
            await updateDoc(doc(db, 'chats', activeChatId), {
              members: arrayUnion(...uids),
              updatedAt: serverTimestamp()
            });

            // Add system messages for each added user
            for (const uid of uids) {
              const addedUser = allUsers.find(u => u.id === uid);
              if (addedUser) {
                await sendSystemMessage(activeChatId, `${addedUser.displayName} đã được thêm vào nhóm`);
              }
            }

            setShowAddMemberModal(false);
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, `chats/${activeChatId}`);
          }
        }}
      />

      {/* Profile Settings Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0a0d14] border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <h3 className="text-lg font-bold">Cài đặt hồ sơ</h3>
                <button onClick={() => setShowProfileModal(false)} className="p-2 hover:bg-white/5 rounded-xl text-slate-400 transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 space-y-8 flex flex-col items-center">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-3xl overflow-hidden border-2 border-white/10 shadow-2xl relative">
                    {profilePhoto ? (
                      <img src={profilePhoto} alt="Avatar Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center text-3xl font-bold text-slate-600">
                        {profileName?.substring(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-blue-600 rounded-xl border border-white/20 flex items-center justify-center cursor-pointer hover:bg-blue-500 transition-all shadow-lg group-hover:scale-110">
                    <Camera className="w-5 h-5 text-white" />
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'user')} />
                  </label>
                </div>

                <div className="w-full space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest ml-1">Tên hiển thị</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-5 text-base focus:outline-none focus:border-blue-500/50 transition-all text-white placeholder:text-slate-600"
                        placeholder="Nhập tên của bạn..."
                      />
                      <Edit2 className="w-4 h-4 text-slate-600 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="pt-4 flex flex-col gap-3">
                    <button 
                      onClick={handleUpdateProfile}
                      disabled={isUpdatingProfile || !profileName.trim()}
                      className="w-full py-4 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white rounded-2xl font-bold hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                    >
                      {isUpdatingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Lưu thay đổi'}
                    </button>
                    <button 
                      onClick={() => setShowProfileModal(false)}
                      className="w-full py-4 bg-white/5 text-slate-400 rounded-2xl font-bold hover:bg-white/10 transition-all text-sm"
                    >
                      Hủy bỏ
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showGroupSettingsModal && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0a0d14] border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <h3 className="text-lg font-bold">Cài đặt nhóm</h3>
                <button onClick={() => setShowGroupSettingsModal(false)} className="p-2 hover:bg-white/5 rounded-xl text-slate-400 transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 space-y-8 flex flex-col items-center">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-3xl overflow-hidden border-2 border-white/10 shadow-2xl relative">
                    {editGroupPhoto ? (
                      <img src={editGroupPhoto} alt="Group Avatar Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-indigo-500/10 flex items-center justify-center text-3xl font-bold text-indigo-400">
                        {editGroupName?.substring(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <label className="absolute -bottom-2 -right-2 w-10 h-10 bg-indigo-600 rounded-xl border border-white/20 flex items-center justify-center cursor-pointer hover:bg-indigo-500 transition-all shadow-lg group-hover:scale-110">
                    <Camera className="w-5 h-5 text-white" />
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(e, 'group')} />
                  </label>
                </div>

                <div className="w-full space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-widest ml-1">Tên nhóm</label>
                    <div className="relative">
                      <input 
                        type="text" 
                        value={editGroupName}
                        onChange={(e) => setEditGroupName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 px-5 text-base focus:outline-none focus:border-indigo-500/50 transition-all text-white placeholder:text-slate-600"
                        placeholder="Nhập tên nhóm..."
                      />
                      <Edit2 className="w-4 h-4 text-slate-600 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="pt-4 flex flex-col gap-3">
                    <button 
                      onClick={handleUpdateGroup}
                      disabled={isUpdatingGroup || !editGroupName.trim()}
                      className="w-full py-4 bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-2xl font-bold hover:shadow-lg hover:shadow-indigo-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                    >
                      {isUpdatingGroup ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Lưu thay đổi'}
                    </button>
                    <button 
                      onClick={() => setShowGroupSettingsModal(false)}
                      className="w-full py-4 bg-white/5 text-slate-400 rounded-2xl font-bold hover:bg-white/10 transition-all text-sm"
                    >
                      Hủy bỏ
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal.show && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0a0d14] border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
            >
              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                  <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-bold mb-2 text-white">{confirmModal.title}</h3>
                <p className="text-sm text-slate-400 mb-6">{confirmModal.message}</p>
                
                <div className="flex gap-3 mt-8">
                  <button 
                    onClick={() => setConfirmModal(prev => ({ ...prev, show: false }))}
                    className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-semibold transition-all"
                  >
                    Hủy
                  </button>
                  <button 
                    onClick={confirmModal.onConfirm}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-red-600/20"
                  >
                    Xác nhận
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface MembersModalProps {
  show: boolean;
  onClose: () => void;
  members: string[];
  allUsers: any[];
  currentUserId: string;
  onStartChat: (user: any) => void;
}

function MembersModal({ show, onClose, members, allUsers, currentUserId, onStartChat }: MembersModalProps) {
  const groupMembers = allUsers.filter(u => members.includes(u.id));

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-[#0a0d14] border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-bold">Thành viên nhóm</h3>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-xl text-slate-400 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-2 max-h-[400px] overflow-y-auto custom-scrollbar">
              {groupMembers.map((member) => (
                <div 
                  key={member.id}
                  className="p-3 flex items-center gap-3 group transition-all"
                >
                  <div 
                    onClick={() => {
                      if (member.id !== currentUserId) {
                        onStartChat(member);
                        onClose();
                      }
                    }}
                    className={`w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-500 border border-white/10 overflow-hidden shrink-0 ${member.id !== currentUserId ? 'cursor-pointer hover:border-blue-500/50 hover:ring-2 hover:ring-blue-500/20 transition-all' : ''}`}
                  >
                    {member.photoURL ? (
                      <img src={member.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      member.displayName?.substring(0, 2).toUpperCase()
                    )}
                  </div>
                  
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-semibold truncate text-white">
                      {member.displayName} {member.id === currentUserId && <span className="text-[10px] text-blue-400 ml-1 font-bold">(Bạn)</span>}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">{member.email}</p>
                  </div>

                  {member.id !== currentUserId && (
                    <button 
                      onClick={() => {
                        onStartChat(member);
                        onClose();
                      }}
                      className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                      title="Nhắn tin riêng"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface AddMemberModalProps {
  show: boolean;
  onClose: () => void;
  currentMembers: string[];
  allUsers: any[];
  onAddMembers: (uids: string[]) => Promise<void>;
}

function AddMemberModal({ show, onClose, currentMembers, allUsers, onAddMembers }: AddMemberModalProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const availableUsers = searchQuery.trim() === '' ? [] : allUsers.filter(u => {
    const query = searchQuery.toLowerCase();
    const emailLocalPart = u.email?.split('@')[0].toLowerCase() || '';
    return (
      !currentMembers.includes(u.id) && 
      (u.displayName?.toLowerCase().includes(query) || emailLocalPart.includes(query))
    );
  });

  const toggle = (uid: string) => {
    setSelected(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  const handleAdd = async () => {
    if (selected.length === 0) return;
    setLoading(true);
    await onAddMembers(selected);
    setLoading(false);
    setSelected([]);
    setSearchQuery('');
  };

  return (
    <AnimatePresence>
      {show && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-[#0a0d14] border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-lg font-bold">Thêm thành viên</h3>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-xl text-slate-400 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="px-6 py-4 border-b border-white/5">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Tìm thành viên..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-base focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600 text-white"
                />
              </div>

              {/* Hiển thị danh sách đã chọn */}
              {selected.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selected.map(uid => {
                    const u = allUsers.find(user => user.id === uid);
                    return (
                      <div key={uid} className="flex items-center gap-2 px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-[10px] font-bold text-indigo-400">
                        {u?.displayName}
                        <button onClick={() => toggle(uid)} className="hover:text-white">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 max-h-[300px] overflow-y-auto custom-scrollbar space-y-2">
              {availableUsers.length > 0 ? (
                availableUsers.map((u) => (
                  <div 
                    key={u.id}
                    onClick={() => toggle(u.id)}
                    className={`p-3 rounded-xl flex items-center gap-3 cursor-pointer transition-all border ${selected.includes(u.id) ? 'bg-indigo-600/10 border-indigo-500/20' : 'bg-white/5 border-transparent hover:border-white/10'}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-500 border border-white/10 overflow-hidden shrink-0">
                      {u.photoURL ? <img src={u.photoURL} alt="" className="w-full h-full object-cover" /> : u.displayName?.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="text-sm font-semibold truncate">{u.displayName}</p>
                      <p className="text-[10px] text-slate-500 truncate">{u.email}</p>
                    </div>
                    {selected.includes(u.id) && <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>}
                  </div>
                ))
              ) : (
                <p className="text-center py-8 text-xs text-slate-600">
                  {searchQuery ? 'Không tìm thấy người dùng' : 'Hãy tìm kiếm thành viên để thêm vào nhóm'}
                </p>
              )}
            </div>

            <div className="p-6 bg-white/[0.01] border-t border-white/5">
              <button 
                onClick={handleAdd}
                disabled={selected.length === 0 || loading}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Thêm {selected.length} thành viên</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface MessageBubbleProps {
  key?: React.Key;
  message: Message;
  currentUserId: string;
  isAdmin: boolean;
  allUsers: User[];
  onDelete: (id: string) => Promise<void> | void;
}

function MessageBubble({ message, currentUserId, isAdmin, onDelete, allUsers }: MessageBubbleProps) {
  const [showMobileActions, setShowMobileActions] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [popoverPlacement, setPopoverPlacement] = useState<'top' | 'bottom'>('top');
  const isMe = message.senderId === currentUserId;
  const time = message.createdAt ? format(message.createdAt.toDate(), 'HH:mm') : '';
  const isDeleted = message.isDeleted === true;
  const isSystem = message.type === 'system';
  const sender = allUsers.find(u => u.id === message.senderId);
  const avatarUrl = sender?.photoURL || message.senderPhoto;

  const handleDoubleClick = (e: React.MouseEvent) => {
    if ((!isMe && !isAdmin) || isDeleted) return;
    e.preventDefault();
    
    // Determine placement based on position in viewport
    if (bubbleRef.current) {
      const rect = bubbleRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      // If bubble is in the top 40% of the screen, show below. Otherwise show above.
      setPopoverPlacement(rect.top < viewportHeight * 0.4 ? 'bottom' : 'top');
    }
    
    setShowMobileActions(true);
    if ("vibrate" in navigator) {
      navigator.vibrate(40);
    }
  };

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center w-full my-2"
      >
        <span className="text-[11px] font-medium text-slate-500 bg-white/5 px-4 py-1.5 rounded-full border border-white/5 uppercase tracking-wider backdrop-blur-sm">
          {message.text}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={bubbleRef}
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onDoubleClick={handleDoubleClick}
      className={`flex items-end gap-2.5 max-w-[85%] sm:max-w-[70%] group select-none ${isMe ? 'ml-auto flex-row-reverse' : 'flex-row'}`}
    >
      <div className="flex-shrink-0 mb-1">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className={`w-8 h-8 rounded-full shadow-lg border border-white/10 object-cover ${isDeleted ? 'opacity-40 grayscale' : ''}`} />
        ) : (
          <div className={`w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-500 text-[10px] ${isDeleted ? 'opacity-40' : ''}`}>
            {(sender?.displayName || message.senderName).substring(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      <div className={`flex flex-col space-y-1 relative ${isMe ? 'items-end' : 'items-start'}`}>
        {!isMe && (
          <span className="text-[10px] font-bold text-slate-500 ml-1 uppercase tracking-wider">
            {sender?.displayName || message.senderName}
          </span>
        )}
        
        <div className="relative group">
          <div className={`
            p-4 rounded-2xl shadow-xl transition-all relative
            ${isMe 
              ? isDeleted 
                ? 'bg-white/[0.03] border border-white/5 text-slate-500 rounded-br-none italic'
                : 'bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 shadow-blue-500/20 text-white rounded-br-none border-t border-white/20' 
              : isDeleted
                ? 'bg-white/[0.02] border border-white/5 text-slate-600 rounded-bl-none italic'
                : 'bg-white/[0.03] backdrop-blur-xl border border-white/10 text-slate-200 rounded-bl-none shadow-black/20'}
          `}>
            <p className={`text-[15px] leading-relaxed break-all whitespace-pre-line ${isDeleted ? 'text-sm' : ''}`}>
              {isDeleted ? 'Tin nhắn này đã xóa' : message.text}
            </p>
            
            <div className={`
              flex items-center gap-1.5 mt-2 opacity-50 group-hover:opacity-100 transition-opacity
              ${isMe ? 'justify-end' : 'justify-start'}
            `}>
              <span className="text-[9px] uppercase font-bold tracking-tighter">
                {time}
              </span>
              {isMe && !isDeleted && (
                <svg className="w-3 h-3 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"></path>
                </svg>
              )}
            </div>
          </div>

          {isMe && !isDeleted && (
            <button
              onClick={() => onDelete(message.id)}
              className="absolute -left-10 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 hidden md:flex items-center justify-center text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all duration-200"
              title="Xóa tin nhắn"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {isAdmin && !isMe && !isDeleted && (
            <button
              onClick={() => onDelete(message.id)}
              className="absolute -right-10 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 hidden md:flex items-center justify-center text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all duration-200"
              title="Xóa tin nhắn (Admin)"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Mobile Context Popover */}
          <AnimatePresence>
            {showMobileActions && (
              <>
                <div 
                  className="fixed inset-0 z-[90] md:hidden bg-black/10 backdrop-blur-[2px]"
                  // User requested only closing via Hủy bỏ button
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: popoverPlacement === 'top' ? 10 : -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: popoverPlacement === 'top' ? 10 : -10 }}
                  className={`absolute z-[100] min-w-[200px] bg-slate-900 border border-white/10 rounded-xl overflow-hidden shadow-2xl md:hidden ${isMe ? 'right-0' : 'left-0'} ${popoverPlacement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(message.id);
                      setShowMobileActions(false);
                    }}
                    className="w-full py-4 px-4 flex items-center gap-3 text-red-500 hover:bg-red-500/10 transition-all font-bold active:bg-red-500/20"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-sm">Xóa tin nhắn</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMobileActions(false);
                    }}
                    className="w-full py-3 px-4 flex items-center justify-center text-slate-400 hover:bg-white/5 transition-all text-xs border-t border-white/5 font-bold uppercase tracking-widest"
                  >
                    Hủy bỏ
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>

  );
}
