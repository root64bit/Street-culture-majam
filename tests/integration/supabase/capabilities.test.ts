// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '@/types/database.types';

const url = process.env.LOCAL_SUPABASE_TEST_URL;
const serviceKey = process.env.LOCAL_SUPABASE_TEST_SERVICE_ROLE_KEY;
const anonKey = process.env.LOCAL_SUPABASE_TEST_ANON_KEY;

describe.runIf(Boolean(url && serviceKey && anonKey))(
  'local capability and privacy policies',
  () => {
    let service: SupabaseClient<Database>;
    const ids: string[] = [];
    const clients: Record<string, SupabaseClient<Database>> = {};
    const password = `Test-${randomBytes(12).toString('hex')}`;

    beforeAll(async () => {
      service = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } });
      for (const role of ['SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER', 'AUTHENTICATOR'] as const) {
        const email = `capability-${role.toLowerCase()}-${randomUUID()}@example.invalid`;
        const { data, error } = await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (error || !data.user) throw error ?? new Error('Test account missing');
        ids.push(data.user.id);
        if (role !== 'CUSTOMER') {
          const { error: roleError } = await service
            .from('user_roles')
            .insert({ user_id: data.user.id, role });
          if (roleError) throw roleError;
        }
        const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } });
        const { error: signInError } = await client.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        clients[role] = client;
      }
    });

    afterAll(async () => {
      if (!service) return;
      if (ids.length) await service.from('admin_audit_logs').delete().in('actor_id', ids);
      for (const id of ids.reverse()) await service.auth.admin.deleteUser(id);
    });

    it('hides profile phone and account data from anonymous and other customers', async () => {
      const anonymous = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } });
      const { data: publicProfiles, error: publicError } = await anonymous
        .from('profiles')
        .select('id,phone');
      expect(publicError).toBeNull();
      expect(publicProfiles).toEqual([]);
      const { data: otherProfile, error } = await clients.CUSTOMER.from('profiles')
        .select('id,phone')
        .eq('id', ids[0]);
      expect(error).toBeNull();
      expect(otherProfile).toEqual([]);
      const { data: ownProfile } = await clients.CUSTOMER.from('profiles')
        .select('id')
        .eq('id', ids[3]);
      expect(ownProfile).toEqual([{ id: ids[3] }]);
    });

    it('blocks a customer from changing account authority fields', async () => {
      const { error } = await clients.CUSTOMER.from('profiles')
        .update({ account_status: 'SUSPENDED' })
        .eq('id', ids[3]);
      expect(error).not.toBeNull();
      const { data } = await service
        .from('profiles')
        .select('account_status')
        .eq('id', ids[3])
        .single();
      expect(data?.account_status).toBe('ACTIVE');
    });

    it('keeps superadmin and finance powers out of ordinary ADMIN and STAFF roles', async () => {
      const capability = async (role: string, name: string) => {
        const { data, error } = await clients[role].rpc('has_capability', {
          check_capability: name,
        });
        expect(error).toBeNull();
        return data;
      };
      expect(await capability('SUPER_ADMIN', 'roles.manage')).toBe(true);
      expect(await capability('SUPER_ADMIN', 'payouts.mark_paid')).toBe(true);
      expect(await capability('ADMIN', 'products.write')).toBe(true);
      expect(await capability('ADMIN', 'roles.manage')).toBe(false);
      expect(await capability('ADMIN', 'payouts.mark_paid')).toBe(false);
      expect(await capability('STAFF', 'dashboard.read')).toBe(true);
      expect(await capability('STAFF', 'products.write')).toBe(false);
    });

    it('denies role escalation to ADMIN and audits a superadmin role grant', async () => {
      const { error: directError } = await clients.ADMIN.from('user_roles').insert({
        user_id: ids[1],
        role: 'SUPER_ADMIN',
      });
      expect(directError).not.toBeNull();
      const { error: rpcError } = await clients.ADMIN.rpc('set_staff_role', {
        target_user_id: ids[1],
        target_role: 'SUPER_ADMIN',
        grant_role: true,
        reason: 'Attempted privilege escalation test',
      });
      expect(rpcError).not.toBeNull();
      const { data: granted, error: grantError } = await clients.SUPER_ADMIN.rpc('set_staff_role', {
        target_user_id: ids[2],
        target_role: 'FINANCE',
        grant_role: true,
        reason: 'Local role permission verification',
      });
      expect(grantError).toBeNull();
      expect(granted).toBe(true);
      const { data: financeAllowed } = await clients.STAFF.rpc('has_capability', {
        check_capability: 'payouts.mark_paid',
      });
      expect(financeAllowed).toBe(true);
      const { data: audit } = await service
        .from('admin_audit_logs')
        .select('action,entity_id')
        .eq('actor_id', ids[0])
        .eq('entity_id', ids[2])
        .eq('action', 'ROLE_GRANTED');
      expect(audit).toHaveLength(1);
    });

    it('keeps payment reconciliation inaccessible to the browser and non-finance operators', async () => {
      const paymentId = randomUUID();
      const { error: browserError } = await clients.SUPER_ADMIN.rpc(
        'record_provider_reconciliation',
        {
          target_payment_id: paymentId,
          operator_id: ids[0],
          provider_status: 'PAID',
        }
      );
      expect(browserError).not.toBeNull();
      const { error: roleError } = await service.rpc('record_provider_reconciliation', {
        target_payment_id: paymentId,
        operator_id: ids[3],
        provider_status: 'PAID',
      });
      expect(roleError).not.toBeNull();
      const { error: notFoundError } = await service.rpc('record_provider_reconciliation', {
        target_payment_id: paymentId,
        operator_id: ids[0],
        provider_status: 'PAID',
      });
      expect(notFoundError?.message).toMatch(/payment not found/i);
    });

    it('limits the staff directory and disables existing sessions at the database boundary', async () => {
      expect((await clients.CUSTOMER.rpc('admin_staff_directory')).error).not.toBeNull();
      const directory = await clients.ADMIN.rpc('admin_staff_directory', { search_text: ids[2] });
      expect(directory.error).toBeNull();
      expect(directory.data?.[0]).toMatchObject({ id: ids[2], admin_access_disabled: false });
      expect(directory.data?.[0].permissions).toContain('dashboard.read');
      expect(
        (
          await clients.ADMIN.rpc('set_admin_access', {
            target_user_id: ids[2],
            disable_access: true,
            reason: 'Ordinary admin cannot disable access',
          })
        ).error
      ).not.toBeNull();
      const disabled = await clients.SUPER_ADMIN.rpc('set_admin_access', {
        target_user_id: ids[2],
        disable_access: true,
        reason: 'Verify revocation for existing sessions',
      });
      expect(disabled.error).toBeNull();
      try {
        expect(
          (await clients.STAFF.rpc('has_capability', { check_capability: 'dashboard.read' })).data
        ).toBe(false);
        expect((await clients.STAFF.rpc('my_capabilities')).data).toEqual([]);
        expect(
          (
            await clients.STAFF.from('profiles')
              .update({ admin_access_disabled: false })
              .eq('id', ids[2])
          ).error
        ).not.toBeNull();
      } finally {
        expect(
          (
            await clients.SUPER_ADMIN.rpc('set_admin_access', {
              target_user_id: ids[2],
              disable_access: false,
              reason: 'Restore test staff after revocation check',
            })
          ).error
        ).toBeNull();
      }
    });

    it('requires an audited operator transition for consignment approval', async () => {
      const submission = {
        seller_id: ids[3],
        brand_name: 'Test Brand',
        product_name: 'Test Item',
        size: 'STANDARD',
        size_system: 'ONE SIZE',
        condition: 'NEW',
        expected_price: 1000,
        currency: 'MZN',
        status: 'SUBMITTED' as const,
      };
      const { error: forged } = await clients.CUSTOMER.from('consignment_submissions').insert({
        ...submission,
        status: 'APPROVED_FOR_DELIVERY',
      });
      expect(forged).not.toBeNull();
      const { data: created, error: createdError } = await clients.CUSTOMER.from(
        'consignment_submissions'
      )
        .insert(submission)
        .select('id')
        .single();
      expect(createdError).toBeNull();
      if (!created) throw new Error('Test submission missing');
      try {
        const denied = await clients.CUSTOMER.rpc('transition_consignment', {
          target_submission_id: created.id,
          review_action: 'APPROVE',
          review_notes: 'Unauthorized customer action',
        });
        expect(denied.error).not.toBeNull();
        const reviewed = await clients.ADMIN.rpc('transition_consignment', {
          target_submission_id: created.id,
          review_action: 'START_REVIEW',
          review_notes: 'Seller supplied sufficient details',
        });
        expect(reviewed.error).toBeNull();
        expect(reviewed.data).toBe('UNDER_REVIEW');
        const invalid = await clients.ADMIN.rpc('transition_consignment', {
          target_submission_id: created.id,
          review_action: 'MARK_RECEIVED',
          review_notes: 'Cannot skip physical delivery steps',
        });
        expect(invalid.error).not.toBeNull();
        const info = await clients.ADMIN.rpc('transition_consignment', {
          target_submission_id: created.id,
          review_action: 'REQUEST_INFO',
          review_notes: 'Please provide the original receipt details',
        });
        expect(info.data).toBe('MORE_INFORMATION_REQUIRED');
        const response = await clients.CUSTOMER.rpc('respond_to_consignment_request', {
          target_submission_id: created.id,
          seller_response: 'Original receipt is available on request',
        });
        expect(response.error).toBeNull();
        const { data: current } = await service
          .from('consignment_submissions')
          .select('status,seller_notes')
          .eq('id', created.id)
          .single();
        expect(current?.status).toBe('SUBMITTED');
        expect(current?.seller_notes).toContain('Original receipt');
        const { data: audit } = await service
          .from('admin_audit_logs')
          .select('action')
          .eq('entity_type', 'consignment')
          .eq('entity_id', created.id);
        expect(audit?.map((entry) => entry.action).sort()).toEqual([
          'CONSIGNMENT_REQUEST_INFO',
          'CONSIGNMENT_SELLER_RESPONSE',
          'CONSIGNMENT_START_REVIEW',
        ]);
      } finally {
        await service.from('consignment_submissions').delete().eq('id', created.id);
      }
    });

    it('does not let staff fulfill unpaid orders or skip a paid order stage', async () => {
      const { data: created, error: createError } = await service
        .from('orders')
        .insert({
          user_id: ids[3],
          order_number: `TEST-${randomUUID()}`,
          subtotal: 1000,
          total_amount: 1000,
          currency: 'MZN',
          status: 'CONFIRMED',
          payment_status: 'UNPAID',
          fulfillment_status: 'UNFULFILLED',
        })
        .select('id')
        .single();
      expect(createError).toBeNull();
      if (!created) throw new Error('Test order missing');
      try {
        const unpaid = await clients.ADMIN.rpc('advance_order_fulfillment', {
          target_order_id: created.id,
          fulfillment_action: 'START_PROCESSING',
          operator_note: 'This cannot happen before payment',
        });
        expect(unpaid.error).not.toBeNull();
        const direct = await clients.ADMIN.from('orders')
          .update({ payment_status: 'PAID' })
          .eq('id', created.id)
          .select('id');
        expect(direct.data).toEqual([]);
        await service.from('orders').update({ payment_status: 'PAID' }).eq('id', created.id);
        const skipped = await clients.ADMIN.rpc('advance_order_fulfillment', {
          target_order_id: created.id,
          fulfillment_action: 'MARK_SHIPPED',
          operator_note: 'Cannot skip packing and processing',
        });
        expect(skipped.error).not.toBeNull();
        const advanced = await clients.ADMIN.rpc('advance_order_fulfillment', {
          target_order_id: created.id,
          fulfillment_action: 'START_PROCESSING',
          operator_note: 'Payment confirmed by the test service',
        });
        expect(advanced.error).toBeNull();
        const { data: order } = await service
          .from('orders')
          .select('status,fulfillment_status')
          .eq('id', created.id)
          .single();
        expect(order).toMatchObject({ status: 'PROCESSING', fulfillment_status: 'UNFULFILLED' });
      } finally {
        await service.from('orders').delete().eq('id', created.id);
      }
    });

    it('requires finance evidence before a payout can be marked paid', async () => {
      const { data: created, error: createError } = await service
        .from('seller_payouts')
        .insert({
          seller_id: ids[3],
          gross_amount: 1000,
          commission_amount: 300,
          net_amount: 700,
          adjustments: 0,
          currency: 'MZN',
          status: 'PENDING',
        })
        .select('id')
        .single();
      expect(createError).toBeNull();
      if (!created) throw new Error('Test payout missing');
      try {
        const early = await clients.SUPER_ADMIN.rpc('transition_seller_payout', {
          target_payout_id: created.id,
          payout_action: 'MARK_PAID',
          operator_note: 'Cannot pay a pending payout yet',
          payout_method: 'M-Pesa',
          payout_reference: `TEST-${randomUUID()}`,
        });
        expect(early.error).not.toBeNull();
        const approved = await clients.ADMIN.rpc('transition_seller_payout', {
          target_payout_id: created.id,
          payout_action: 'APPROVE',
          operator_note: 'Seller payout amount reconciled',
        });
        expect(approved.data).toBe('APPROVED');
        const processing = await clients.ADMIN.rpc('transition_seller_payout', {
          target_payout_id: created.id,
          payout_action: 'MARK_PROCESSING',
          operator_note: 'External transfer is underway',
        });
        expect(processing.data).toBe('PROCESSING');
        const unauthorized = await clients.ADMIN.rpc('transition_seller_payout', {
          target_payout_id: created.id,
          payout_action: 'MARK_PAID',
          operator_note: 'Ordinary admin cannot attest payment',
          payout_method: 'M-Pesa',
          payout_reference: `TEST-${randomUUID()}`,
        });
        expect(unauthorized.error).not.toBeNull();
        const reference = `TEST-${randomUUID()}`;
        const paid = await clients.SUPER_ADMIN.rpc('transition_seller_payout', {
          target_payout_id: created.id,
          payout_action: 'MARK_PAID',
          operator_note: 'External transfer reference verified',
          payout_method: 'M-Pesa',
          payout_reference: reference,
        });
        expect(paid.data).toBe('PAID');
        const { data: record } = await service
          .from('seller_payouts')
          .select('status,net_amount,payment_reference')
          .eq('id', created.id)
          .single();
        expect(record).toMatchObject({
          status: 'PAID',
          net_amount: 700,
          payment_reference: reference,
        });
        const mutation = await service
          .from('seller_payouts')
          .update({ net_amount: 999 })
          .eq('id', created.id);
        expect(mutation.error).not.toBeNull();
      } finally {
        await service.from('seller_payouts').delete().eq('id', created.id);
      }
    });

    it('ties a human authentication decision to the consignment status', async () => {
      const { data: submission, error: createError } = await service
        .from('consignment_submissions')
        .insert({
          seller_id: ids[3],
          brand_name: 'Test Brand',
          product_name: 'Test Bag',
          size: 'STANDARD',
          condition: 'NEW',
          expected_price: 2000,
          currency: 'MZN',
          status: 'RECEIVED',
        })
        .select('id')
        .single();
      expect(createError).toBeNull();
      if (!submission) throw new Error('Test consignment missing');
      try {
        const queued = await clients.ADMIN.rpc('transition_consignment', {
          target_submission_id: submission.id,
          review_action: 'SEND_TO_AUTH',
          review_notes: 'Physical item received for inspection',
        });
        expect(queued.data).toBe('AUTHENTICATION_PENDING');
        const { data: records } = await service
          .from('authentication_records')
          .select('id,status')
          .eq('consignment_submission_id', submission.id);
        expect(records).toHaveLength(1);
        const recordId = records![0].id;
        const sellerAttempt = await clients.CUSTOMER.rpc('decide_consignment_authentication', {
          target_record_id: recordId,
          auth_action: 'PASS',
          decision_note: 'Forged seller decision',
          confirmed_condition: 'NEW',
        });
        expect(sellerAttempt.error).not.toBeNull();
        const started = await clients.AUTHENTICATOR.rpc('decide_consignment_authentication', {
          target_record_id: recordId,
          auth_action: 'START',
          decision_note: 'Inspecting all labels and materials',
        });
        expect(started.error).toBeNull();
        expect(started.data).toBe('IN_REVIEW');
        const passed = await clients.AUTHENTICATOR.rpc('decide_consignment_authentication', {
          target_record_id: recordId,
          auth_action: 'PASS',
          decision_note: 'Materials and identifiers matched the item',
          confirmed_condition: 'NEW',
        });
        expect(passed.data).toBe('PASSED');
        const { data: current } = await service
          .from('consignment_submissions')
          .select('status')
          .eq('id', submission.id)
          .single();
        expect(current?.status).toBe('AUTHENTICATED');
      } finally {
        await service.from('consignment_submissions').delete().eq('id', submission.id);
      }
    });
  }
);
