// Group service for Firebase cloud groups.
// Handles group create, join, leave, member management, and invite codes.
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  runTransaction,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from './firebase'
import { isoNow } from './utils'
import type { Group, GroupMember } from '../domain/cloud-types'

function genInviteCode(): string {
  // 6-char alphanumeric, no ambiguous chars
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

export const groupService = {
  /** Create a new group. Caller becomes the owner. */
  async createGroup(
    name: string,
    description: string,
    uid: string,
    displayName: string,
    photoURL: string | null
  ): Promise<Group> {
    if (!isFirebaseConfigured || !db) throw new Error('Firebase not configured')
    const now = isoNow()
    // Generate a unique invite code (retry on collision)
    let inviteCode = genInviteCode()
    for (let i = 0; i < 5; i++) {
      const ref = doc(db, 'groups', inviteCode)
      const snap = await getDoc(ref)
      if (!snap.exists()) break
      inviteCode = genInviteCode()
    }
    const group: Group = {
      id: inviteCode,
      name,
      description: description || '',
      inviteCode,
      createdBy: uid,
      createdAt: now,
      updatedAt: now,
      memberCount: 1,
    }
    await setDoc(doc(db, 'groups', inviteCode), group)
    const member: GroupMember = {
      groupId: inviteCode,
      uid,
      displayName,
      photoURL,
      joinedAt: now,
      role: 'owner',
    }
    await setDoc(doc(db, 'groupMembers', `${inviteCode}_${uid}`), member)
    return group
  },

  /** Join a group by invite code. */
  async joinGroup(
    inviteCode: string,
    uid: string,
    displayName: string,
    photoURL: string | null
  ): Promise<Group> {
    if (!isFirebaseConfigured || !db) throw new Error('Firebase not configured')
    const groupRef = doc(db, 'groups', inviteCode)
    const groupSnap = await getDoc(groupRef)
    if (!groupSnap.exists()) throw new Error('Invalid invite code')
    const group = groupSnap.data() as Group
    const memberRef = doc(db, 'groupMembers', `${inviteCode}_${uid}`)
    const memberSnap = await getDoc(memberRef)
    if (memberSnap.exists()) {
      // Already a member — return the group
      return group
    }
    const now = isoNow()
    const member: GroupMember = {
      groupId: inviteCode,
      uid,
      displayName,
      photoURL,
      joinedAt: now,
      role: 'member',
    }
    // Use a transaction to atomically add member and bump count
    await runTransaction(db, async (tx) => {
      tx.set(memberRef, member)
      tx.update(groupRef, {
        memberCount: group.memberCount + 1,
        updatedAt: now,
      })
    })
    return { ...group, memberCount: group.memberCount + 1 }
  },

  /** Leave a group. */
  async leaveGroup(groupId: string, uid: string) {
    if (!isFirebaseConfigured || !db) throw new Error('Firebase not configured')
    const groupRef = doc(db, 'groups', groupId)
    const memberRef = doc(db, 'groupMembers', `${groupId}_${uid}`)
    const groupSnap = await getDoc(groupRef)
    const memberSnap = await getDoc(memberRef)
    if (!groupSnap.exists() || !memberSnap.exists()) return
    const group = groupSnap.data() as Group
    await runTransaction(db, async (tx) => {
      tx.delete(memberRef)
      if (group.memberCount > 1) {
        tx.update(groupRef, {
          memberCount: group.memberCount - 1,
          updatedAt: isoNow(),
        })
      } else {
        // Last member leaving — delete the group
        tx.delete(groupRef)
      }
    })
  },

  /** Delete a group (owner only). */
  async deleteGroup(groupId: string) {
    if (!isFirebaseConfigured || !db) throw new Error('Firebase not configured')
    // Delete all member docs first
    const members = await this.listMembers(groupId)
    for (const m of members) {
      await deleteDoc(doc(db, 'groupMembers', `${groupId}_${m.uid}`))
    }
    await deleteDoc(doc(db, 'groups', groupId))
  },

  /** Get a group by id. */
  async getGroup(groupId: string): Promise<Group | null> {
    if (!isFirebaseConfigured || !db) return null
    const snap = await getDoc(doc(db, 'groups', groupId))
    return snap.exists() ? (snap.data() as Group) : null
  },

  /** List all groups the user is a member of. */
  async listMyGroups(uid: string): Promise<Group[]> {
    if (!isFirebaseConfigured || !db) return []
    const q = query(collection(db, 'groupMembers'), where('uid', '==', uid))
    const snap = await getDocs(q)
    const groupIds = snap.docs.map((d) => (d.data() as GroupMember).groupId)
    const groups: Group[] = []
    for (const id of groupIds) {
      const g = await this.getGroup(id)
      if (g) groups.push(g)
    }
    return groups
  },

  /** List members of a group. */
  async listMembers(groupId: string): Promise<GroupMember[]> {
    if (!isFirebaseConfigured || !db) return []
    const q = query(collection(db, 'groupMembers'), where('groupId', '==', groupId))
    const snap = await getDocs(q)
    return snap.docs.map((d) => d.data() as GroupMember)
  },

  /** Get a single member's record. */
  async getMember(groupId: string, uid: string): Promise<GroupMember | null> {
    if (!isFirebaseConfigured || !db) return null
    const snap = await getDoc(doc(db, 'groupMembers', `${groupId}_${uid}`))
    return snap.exists() ? (snap.data() as GroupMember) : null
  },
}
