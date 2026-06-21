/// <reference types="bun-types" />

import { describe, expect, test } from "bun:test"
import type { RuntimeState } from "@oh-my-opencode/team-core/types"
import { hasPendingDeliveryForMessage } from "./messaging-live-delivery-recipient"

type RuntimeMember = RuntimeState["members"][number]

function idleMember(pendingInjectedMessageIds: string[]): RuntimeMember {
  return {
    name: "m1",
    agentType: "general-purpose",
    status: "idle",
    pendingInjectedMessageIds,
  }
}

describe("hasPendingDeliveryForMessage — live-delivery wake skip (#8 / #5)", () => {
  test("#given a stale pending id from a prior round #when a NEW message arrives #then it does NOT skip (the idle member is woken)", () => {
    // given a member that still carries a pending id from an earlier message
    const member = idleMember(["old-round-message-id"])

    // when a brand-new broadcast/direct message is delivered
    const skip = hasPendingDeliveryForMessage(member, "new-message-id")

    // then the wake is NOT skipped — the broad "any pending" guard used to block this forever
    expect(skip).toBe(false)
  })

  test("#given THIS message is already in flight #then it DOES skip (duplicate-injection guard preserved)", () => {
    // given the current message id is already pending for the recipient
    const member = idleMember(["msg-1", "msg-2"])

    // when the same message id is delivered again
    const skip = hasPendingDeliveryForMessage(member, "msg-2")

    // then it skips so the same message is not dispatched twice
    expect(skip).toBe(true)
  })

  test("#given no pending ids #then it does NOT skip", () => {
    expect(hasPendingDeliveryForMessage(idleMember([]), "msg-1")).toBe(false)
  })
})
