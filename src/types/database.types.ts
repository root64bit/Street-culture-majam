
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "account_operator_notes": {
                  Row: {
                    "account_id": string,"context": string,"created_at": string,"created_by": string | null,"id": string,"note": string
                  }
                  Insert: {
                    "account_id": string,"context": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"note": string
                  }
                  Update: {
                    "account_id"?: string,"context"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "account_operator_notes_account_id_fkey"
      columns: ["account_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "account_operator_notes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"metadata": NonNullable<Json>
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"metadata"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_notification_receipts": {
                  Row: {
                    "notification_id": string,"read_at": string,"user_id": string
                  }
                  Insert: {
                    "notification_id": string,"read_at"?: string,"user_id": string
                  }
                  Update: {
                    "notification_id"?: string,"read_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_notification_receipts_notification_id_fkey"
      columns: ["notification_id"]
isOneToOne: false
      referencedRelation: "admin_operational_notifications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "admin_notification_receipts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_operational_notifications": {
                  Row: {
                    "created_at": string,"event_key": string,"href": string,"id": string,"required_capability": string,"title": string,"type": string
                  }
                  Insert: {
                    "created_at"?: string,"event_key": string,"href": string,"id"?: string,"required_capability": string,"title": string,"type": string
                  }
                  Update: {
                    "created_at"?: string,"event_key"?: string,"href"?: string,"id"?: string,"required_capability"?: string,"title"?: string,"type"?: string
                  }
                  Relationships: [
                    
                  ]
                },"authentication_evidence": {
                  Row: {
                    "caption": string,"created_at": string,"id": string,"record_id": string,"storage_object_id": string,"storage_path": string,"uploaded_by": string
                  }
                  Insert: {
                    "caption": string,"created_at"?: string,"id"?: string,"record_id": string,"storage_object_id": string,"storage_path": string,"uploaded_by": string
                  }
                  Update: {
                    "caption"?: string,"created_at"?: string,"id"?: string,"record_id"?: string,"storage_object_id"?: string,"storage_path"?: string,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "authentication_evidence_record_id_fkey"
      columns: ["record_id"]
isOneToOne: false
      referencedRelation: "authentication_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "authentication_evidence_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"authentication_records": {
                  Row: {
                    "assigned_to": string | null,"authenticated_at": string | null,"authenticator_id": string | null,"comparison_notes": string | null,"condition_confirmed": string | null,"consignment_submission_id": string | null,"created_at": string,"decision_notes": string | null,"id": string,"inspection_checklist": NonNullable<Json>,"listing_id": string | null,"priority": string,"status": Database["public"]['Enums']["auth_record_status_enum"],"style_review": string | null,"updated_at": string
                  }
                  Insert: {
                    "assigned_to"?: string | null,"authenticated_at"?: string | null,"authenticator_id"?: string | null,"comparison_notes"?: string | null,"condition_confirmed"?: string | null,"consignment_submission_id"?: string | null,"created_at"?: string,"decision_notes"?: string | null,"id"?: string,"inspection_checklist"?: NonNullable<Json>,"listing_id"?: string | null,"priority"?: string,"status"?: Database["public"]['Enums']["auth_record_status_enum"],"style_review"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"authenticated_at"?: string | null,"authenticator_id"?: string | null,"comparison_notes"?: string | null,"condition_confirmed"?: string | null,"consignment_submission_id"?: string | null,"created_at"?: string,"decision_notes"?: string | null,"id"?: string,"inspection_checklist"?: NonNullable<Json>,"listing_id"?: string | null,"priority"?: string,"status"?: Database["public"]['Enums']["auth_record_status_enum"],"style_review"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "authentication_records_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "authentication_records_authenticator_id_fkey"
      columns: ["authenticator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "authentication_records_consignment_submission_id_fkey"
      columns: ["consignment_submission_id"]
isOneToOne: false
      referencedRelation: "consignment_submissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "authentication_records_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "authentication_records_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "public_catalog_listings"
      referencedColumns: ["listing_id"]
    }
                  ]
                },"brands": {
                  Row: {
                    "active": boolean,"created_at": string,"description": string | null,"featured": boolean,"id": string,"logo_object_id": string | null,"logo_path": string | null,"name": string,"slug": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"featured"?: boolean,"id"?: string,"logo_object_id"?: string | null,"logo_path"?: string | null,"name": string,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"featured"?: boolean,"id"?: string,"logo_object_id"?: string | null,"logo_path"?: string | null,"name"?: string,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"cart_items": {
                  Row: {
                    "cart_id": string,"created_at": string,"id": string,"listing_id": string,"price_snapshot": number,"quantity": number
                  }
                  Insert: {
                    "cart_id": string,"created_at"?: string,"id"?: string,"listing_id": string,"price_snapshot": number,"quantity"?: number
                  }
                  Update: {
                    "cart_id"?: string,"created_at"?: string,"id"?: string,"listing_id"?: string,"price_snapshot"?: number,"quantity"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cart_items_cart_id_fkey"
      columns: ["cart_id"]
isOneToOne: false
      referencedRelation: "carts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_items_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cart_items_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "public_catalog_listings"
      referencedColumns: ["listing_id"]
    }
                  ]
                },"carts": {
                  Row: {
                    "created_at": string,"id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "carts_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "active": boolean,"created_at": string,"description": string | null,"id": string,"image_object_id": string | null,"image_path": string | null,"name": string,"parent_id": string | null,"slug": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"id"?: string,"image_object_id"?: string | null,"image_path"?: string | null,"name": string,"parent_id"?: string | null,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"description"?: string | null,"id"?: string,"image_object_id"?: string | null,"image_path"?: string | null,"name"?: string,"parent_id"?: string | null,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "categories_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "public_catalog_listings"
      referencedColumns: ["category_id"]
    }
                  ]
                },"commission_rules": {
                  Row: {
                    "active": boolean,"brand_id": string | null,"category_id": string | null,"created_at": string,"currency": string,"ends_at": string | null,"fixed_fee": number,"id": string,"minimum_fee": number,"name": string,"percentage": number,"priority": number,"seller_type": string,"starts_at": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"brand_id"?: string | null,"category_id"?: string | null,"created_at"?: string,"currency"?: string,"ends_at"?: string | null,"fixed_fee"?: number,"id"?: string,"minimum_fee"?: number,"name": string,"percentage"?: number,"priority"?: number,"seller_type"?: string,"starts_at"?: string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"brand_id"?: string | null,"category_id"?: string | null,"created_at"?: string,"currency"?: string,"ends_at"?: string | null,"fixed_fee"?: number,"id"?: string,"minimum_fee"?: number,"name"?: string,"percentage"?: number,"priority"?: number,"seller_type"?: string,"starts_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "commission_rules_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commission_rules_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "public_catalog_listings"
      referencedColumns: ["brand_id"]
    },{
      foreignKeyName: "commission_rules_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "commission_rules_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "public_catalog_listings"
      referencedColumns: ["category_id"]
    }
                  ]
                },"consignment_media": {
                  Row: {
                    "consignment_submission_id": string,"created_at": string,"id": string,"photo_type": Database["public"]['Enums']["consignment_photo_type_enum"],"sort_order": number,"storage_path": string
                  }
                  Insert: {
                    "consignment_submission_id": string,"created_at"?: string,"id"?: string,"photo_type"?: Database["public"]['Enums']["consignment_photo_type_enum"],"sort_order"?: number,"storage_path": string
                  }
                  Update: {
                    "consignment_submission_id"?: string,"created_at"?: string,"id"?: string,"photo_type"?: Database["public"]['Enums']["consignment_photo_type_enum"],"sort_order"?: number,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consignment_media_consignment_submission_id_fkey"
      columns: ["consignment_submission_id"]
isOneToOne: false
      referencedRelation: "consignment_submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"consignment_submissions": {
                  Row: {
                    "approved_at": string | null,"brand_name": string,"category_id": string | null,"condition": string,"created_at": string,"currency": string,"delivery_method": string,"expected_price": number,"id": string,"internal_notes": string | null,"product_id": string | null,"product_name": string,"proof_of_purchase_path": string | null,"purchase_year": number | null,"received_at": string | null,"seller_id": string,"seller_notes": string | null,"size": string,"size_system": string,"status": Database["public"]['Enums']["consignment_status_enum"],"submitted_at": string | null,"updated_at": string
                  }
                  Insert: {
                    "approved_at"?: string | null,"brand_name": string,"category_id"?: string | null,"condition": string,"created_at"?: string,"currency"?: string,"delivery_method"?: string,"expected_price": number,"id"?: string,"internal_notes"?: string | null,"product_id"?: string | null,"product_name": string,"proof_of_purchase_path"?: string | null,"purchase_year"?: number | null,"received_at"?: string | null,"seller_id": string,"seller_notes"?: string | null,"size": string,"size_system"?: string,"status"?: Database["public"]['Enums']["consignment_status_enum"],"submitted_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"brand_name"?: string,"category_id"?: string | null,"condition"?: string,"created_at"?: string,"currency"?: string,"delivery_method"?: string,"expected_price"?: number,"id"?: string,"internal_notes"?: string | null,"product_id"?: string | null,"product_name"?: string,"proof_of_purchase_path"?: string | null,"purchase_year"?: number | null,"received_at"?: string | null,"seller_id"?: string,"seller_notes"?: string | null,"size"?: string,"size_system"?: string,"status"?: Database["public"]['Enums']["consignment_status_enum"],"submitted_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consignment_submissions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consignment_submissions_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "public_catalog_listings"
      referencedColumns: ["category_id"]
    },{
      foreignKeyName: "consignment_submissions_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consignment_submissions_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"guest_checkout_rate_limits": {
                  Row: {
                    "attempt_count": number,"key_hash": string,"updated_at": string,"window_started_at": string
                  }
                  Insert: {
                    "attempt_count"?: number,"key_hash": string,"updated_at"?: string,"window_started_at"?: string
                  }
                  Update: {
                    "attempt_count"?: number,"key_hash"?: string,"updated_at"?: string,"window_started_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"listings": {
                  Row: {
                    "asking_price": number,"authentication_status": string,"condition": string,"consignment_submission_id": string | null,"created_at": string,"currency": string,"id": string,"ownership_type": Database["public"]['Enums']["listing_ownership_type"],"product_id": string,"published_at": string | null,"quantity": number,"reservation_expires_at": string | null,"reserved_at": string | null,"reserved_by_order_id": string | null,"seller_id": string | null,"sold_at": string | null,"status": Database["public"]['Enums']["listing_status_enum"],"updated_at": string,"variant_id": string
                  }
                  Insert: {
                    "asking_price": number,"authentication_status"?: string,"condition": string,"consignment_submission_id"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"ownership_type"?: Database["public"]['Enums']["listing_ownership_type"],"product_id": string,"published_at"?: string | null,"quantity"?: number,"reservation_expires_at"?: string | null,"reserved_at"?: string | null,"reserved_by_order_id"?: string | null,"seller_id"?: string | null,"sold_at"?: string | null,"status"?: Database["public"]['Enums']["listing_status_enum"],"updated_at"?: string,"variant_id": string
                  }
                  Update: {
                    "asking_price"?: number,"authentication_status"?: string,"condition"?: string,"consignment_submission_id"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"ownership_type"?: Database["public"]['Enums']["listing_ownership_type"],"product_id"?: string,"published_at"?: string | null,"quantity"?: number,"reservation_expires_at"?: string | null,"reserved_at"?: string | null,"reserved_by_order_id"?: string | null,"seller_id"?: string | null,"sold_at"?: string | null,"status"?: Database["public"]['Enums']["listing_status_enum"],"updated_at"?: string,"variant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_consignment_submission_id_fkey"
      columns: ["consignment_submission_id"]
isOneToOne: false
      referencedRelation: "consignment_submissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_reserved_by_order_id_fkey"
      columns: ["reserved_by_order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string,"created_at": string,"id": string,"metadata": NonNullable<Json>,"read_at": string | null,"title": string,"type": string,"user_id": string
                  }
                  Insert: {
                    "body": string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"read_at"?: string | null,"title": string,"type": string,"user_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"read_at"?: string | null,"title"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"offers": {
                  Row: {
                    "amount": number,"buyer_id": string,"created_at": string,"currency": string,"expires_at": string,"id": string,"listing_id": string,"responded_at": string | null,"status": Database["public"]['Enums']["offer_status_enum"],"updated_at": string
                  }
                  Insert: {
                    "amount": number,"buyer_id": string,"created_at"?: string,"currency"?: string,"expires_at": string,"id"?: string,"listing_id": string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["offer_status_enum"],"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"buyer_id"?: string,"created_at"?: string,"currency"?: string,"expires_at"?: string,"id"?: string,"listing_id"?: string,"responded_at"?: string | null,"status"?: Database["public"]['Enums']["offer_status_enum"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "offers_buyer_id_fkey"
      columns: ["buyer_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "offers_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "public_catalog_listings"
      referencedColumns: ["listing_id"]
    }
                  ]
                },"order_events": {
                  Row: {
                    "created_at": string,"created_by": string | null,"event_type": string,"id": string,"metadata": NonNullable<Json>,"order_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"event_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"order_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"event_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_events_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_events_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "brand_name_snapshot": string,"commission_amount": number,"commission_rule_id": string | null,"commission_snapshot": NonNullable<Json>,"condition_snapshot": string,"created_at": string,"id": string,"listing_id": string | null,"order_id": string,"product_id": string | null,"product_name_snapshot": string,"quantity": number,"seller_id": string | null,"seller_net_amount": number,"size_snapshot": string,"unit_price": number,"variant_id": string | null
                  }
                  Insert: {
                    "brand_name_snapshot": string,"commission_amount"?: number,"commission_rule_id"?: string | null,"commission_snapshot"?: NonNullable<Json>,"condition_snapshot": string,"created_at"?: string,"id"?: string,"listing_id"?: string | null,"order_id": string,"product_id"?: string | null,"product_name_snapshot": string,"quantity"?: number,"seller_id"?: string | null,"seller_net_amount"?: number,"size_snapshot": string,"unit_price": number,"variant_id"?: string | null
                  }
                  Update: {
                    "brand_name_snapshot"?: string,"commission_amount"?: number,"commission_rule_id"?: string | null,"commission_snapshot"?: NonNullable<Json>,"condition_snapshot"?: string,"created_at"?: string,"id"?: string,"listing_id"?: string | null,"order_id"?: string,"product_id"?: string | null,"product_name_snapshot"?: string,"quantity"?: number,"seller_id"?: string | null,"seller_net_amount"?: number,"size_snapshot"?: string,"unit_price"?: number,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_commission_rule_id_fkey"
      columns: ["commission_rule_id"]
isOneToOne: false
      referencedRelation: "commission_rules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "public_catalog_listings"
      referencedColumns: ["listing_id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"order_operator_notes": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"note": string,"order_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"note": string,"order_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string,"order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_operator_notes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_operator_notes_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_refund_requests": {
                  Row: {
                    "created_at": string,"external_reference": string | null,"id": string,"order_id": string,"reason": string,"requested_by": string | null,"review_note": string | null,"reviewed_by": string | null,"status": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"external_reference"?: string | null,"id"?: string,"order_id": string,"reason": string,"requested_by"?: string | null,"review_note"?: string | null,"reviewed_by"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"external_reference"?: string | null,"id"?: string,"order_id"?: string,"reason"?: string,"requested_by"?: string | null,"review_note"?: string | null,"reviewed_by"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_refund_requests_order_id_fkey"
      columns: ["order_id"]
isOneToOne: true
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_refund_requests_requested_by_fkey"
      columns: ["requested_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_refund_requests_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "billing_address_snapshot": NonNullable<Json>,"created_at": string,"currency": string,"discount_amount": number,"fulfillment_status": Database["public"]['Enums']["order_fulfillment_status_enum"],"guest_access_token_hash": string | null,"guest_email": string | null,"guest_name": string | null,"guest_phone": string | null,"id": string,"order_number": string,"payment_expires_at": string | null,"payment_status": Database["public"]['Enums']["order_payment_status_enum"],"shipping_address_snapshot": NonNullable<Json>,"shipping_amount": number,"shipping_method_id": string | null,"shipping_method_snapshot": NonNullable<Json>,"status": Database["public"]['Enums']["order_status_enum"],"subtotal": number,"total_amount": number,"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "billing_address_snapshot"?: NonNullable<Json>,"created_at"?: string,"currency"?: string,"discount_amount"?: number,"fulfillment_status"?: Database["public"]['Enums']["order_fulfillment_status_enum"],"guest_access_token_hash"?: string | null,"guest_email"?: string | null,"guest_name"?: string | null,"guest_phone"?: string | null,"id"?: string,"order_number": string,"payment_expires_at"?: string | null,"payment_status"?: Database["public"]['Enums']["order_payment_status_enum"],"shipping_address_snapshot"?: NonNullable<Json>,"shipping_amount"?: number,"shipping_method_id"?: string | null,"shipping_method_snapshot"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["order_status_enum"],"subtotal": number,"total_amount": number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "billing_address_snapshot"?: NonNullable<Json>,"created_at"?: string,"currency"?: string,"discount_amount"?: number,"fulfillment_status"?: Database["public"]['Enums']["order_fulfillment_status_enum"],"guest_access_token_hash"?: string | null,"guest_email"?: string | null,"guest_name"?: string | null,"guest_phone"?: string | null,"id"?: string,"order_number"?: string,"payment_expires_at"?: string | null,"payment_status"?: Database["public"]['Enums']["order_payment_status_enum"],"shipping_address_snapshot"?: NonNullable<Json>,"shipping_amount"?: number,"shipping_method_id"?: string | null,"shipping_method_snapshot"?: NonNullable<Json>,"status"?: Database["public"]['Enums']["order_status_enum"],"subtotal"?: number,"total_amount"?: number,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orders_shipping_method_id_fkey"
      columns: ["shipping_method_id"]
isOneToOne: false
      referencedRelation: "shipping_methods"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orders_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"currency": string,"failed_at": string | null,"id": string,"idempotency_key": string | null,"last_provider_status": string | null,"last_reconciled_at": string | null,"order_id": string,"paid_at": string | null,"provider": string,"provider_payload": NonNullable<Json>,"provider_reference": string | null,"reconciliation_needs_review": boolean,"status": Database["public"]['Enums']["payment_record_status_enum"],"updated_at": string
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"currency"?: string,"failed_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"last_provider_status"?: string | null,"last_reconciled_at"?: string | null,"order_id": string,"paid_at"?: string | null,"provider": string,"provider_payload"?: NonNullable<Json>,"provider_reference"?: string | null,"reconciliation_needs_review"?: boolean,"status"?: Database["public"]['Enums']["payment_record_status_enum"],"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"currency"?: string,"failed_at"?: string | null,"id"?: string,"idempotency_key"?: string | null,"last_provider_status"?: string | null,"last_reconciled_at"?: string | null,"order_id"?: string,"paid_at"?: string | null,"provider"?: string,"provider_payload"?: NonNullable<Json>,"provider_reference"?: string | null,"reconciliation_needs_review"?: boolean,"status"?: Database["public"]['Enums']["payment_record_status_enum"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"product_import_batches": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"created_by": string,"failed_rows": number,"file_sha256": string,"id": string,"imported_rows": number,"invalid_rows": number,"mode": string,"source_filename": string,"source_type": string,"status": string,"total_rows": number,"updated_at": string,"valid_rows": number
                  }
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"created_by": string,"failed_rows"?: number,"file_sha256": string,"id"?: string,"imported_rows"?: number,"invalid_rows"?: number,"mode"?: string,"source_filename": string,"source_type": string,"status"?: string,"total_rows"?: number,"updated_at"?: string,"valid_rows"?: number
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"created_by"?: string,"failed_rows"?: number,"file_sha256"?: string,"id"?: string,"imported_rows"?: number,"invalid_rows"?: number,"mode"?: string,"source_filename"?: string,"source_type"?: string,"status"?: string,"total_rows"?: number,"updated_at"?: string,"valid_rows"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_import_batches_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"product_import_rows": {
                  Row: {
                    "batch_id": string,"created_at": string,"id": string,"listing_id": string | null,"normalized_data": NonNullable<Json>,"product_id": string | null,"raw_data": NonNullable<Json>,"row_number": number,"status": string,"updated_at": string,"validation_errors": NonNullable<Json>,"validation_warnings": NonNullable<Json>
                  }
                  Insert: {
                    "batch_id": string,"created_at"?: string,"id"?: string,"listing_id"?: string | null,"normalized_data"?: NonNullable<Json>,"product_id"?: string | null,"raw_data"?: NonNullable<Json>,"row_number": number,"status"?: string,"updated_at"?: string,"validation_errors"?: NonNullable<Json>,"validation_warnings"?: NonNullable<Json>
                  }
                  Update: {
                    "batch_id"?: string,"created_at"?: string,"id"?: string,"listing_id"?: string | null,"normalized_data"?: NonNullable<Json>,"product_id"?: string | null,"raw_data"?: NonNullable<Json>,"row_number"?: number,"status"?: string,"updated_at"?: string,"validation_errors"?: NonNullable<Json>,"validation_warnings"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_import_rows_batch_id_fkey"
      columns: ["batch_id"]
isOneToOne: false
      referencedRelation: "product_import_batches"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_import_rows_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_import_rows_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "public_catalog_listings"
      referencedColumns: ["listing_id"]
    },{
      foreignKeyName: "product_import_rows_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_media": {
                  Row: {
                    "alt_text": string | null,"created_at": string,"id": string,"media_type": string,"product_id": string,"sort_order": number,"storage_object_id": string | null,"storage_path": string
                  }
                  Insert: {
                    "alt_text"?: string | null,"created_at"?: string,"id"?: string,"media_type"?: string,"product_id": string,"sort_order"?: number,"storage_object_id"?: string | null,"storage_path": string
                  }
                  Update: {
                    "alt_text"?: string | null,"created_at"?: string,"id"?: string,"media_type"?: string,"product_id"?: string,"sort_order"?: number,"storage_object_id"?: string | null,"storage_path"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_media_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "active": boolean,"color": string | null,"created_at": string,"id": string,"price_override": number | null,"product_id": string,"size": string,"size_system": string,"sku": string | null,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"color"?: string | null,"created_at"?: string,"id"?: string,"price_override"?: number | null,"product_id": string,"size": string,"size_system"?: string,"sku"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"color"?: string | null,"created_at"?: string,"id"?: string,"price_override"?: number | null,"product_id"?: string,"size"?: string,"size_system"?: string,"sku"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "active": boolean,"archived_at": string | null,"brand_id": string,"category_id": string,"colorway": string | null,"created_at": string,"currency": string,"description": string | null,"featured": boolean,"gender": string | null,"id": string,"import_reference": string | null,"meta_description": string | null,"meta_title": string | null,"model": string | null,"most_wanted": boolean,"name": string,"release_year": number | null,"retail_price": number | null,"sku": string | null,"slug": string,"style_code": string | null,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"archived_at"?: string | null,"brand_id": string,"category_id": string,"colorway"?: string | null,"created_at"?: string,"currency"?: string,"description"?: string | null,"featured"?: boolean,"gender"?: string | null,"id"?: string,"import_reference"?: string | null,"meta_description"?: string | null,"meta_title"?: string | null,"model"?: string | null,"most_wanted"?: boolean,"name": string,"release_year"?: number | null,"retail_price"?: number | null,"sku"?: string | null,"slug": string,"style_code"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"archived_at"?: string | null,"brand_id"?: string,"category_id"?: string,"colorway"?: string | null,"created_at"?: string,"currency"?: string,"description"?: string | null,"featured"?: boolean,"gender"?: string | null,"id"?: string,"import_reference"?: string | null,"meta_description"?: string | null,"meta_title"?: string | null,"model"?: string | null,"most_wanted"?: boolean,"name"?: string,"release_year"?: number | null,"retail_price"?: number | null,"sku"?: string | null,"slug"?: string,"style_code"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "public_catalog_listings"
      referencedColumns: ["brand_id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "public_catalog_listings"
      referencedColumns: ["category_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "account_status": string,"account_type": Database["public"]['Enums']["profile_account_type"],"admin_access_disabled": boolean,"avatar_path": string | null,"country_code": string | null,"created_at": string,"display_name": string | null,"full_name": string | null,"id": string,"is_verified_seller": boolean,"phone": string | null,"preferred_currency": string,"updated_at": string
                  }
                  Insert: {
                    "account_status"?: string,"account_type"?: Database["public"]['Enums']["profile_account_type"],"admin_access_disabled"?: boolean,"avatar_path"?: string | null,"country_code"?: string | null,"created_at"?: string,"display_name"?: string | null,"full_name"?: string | null,"id": string,"is_verified_seller"?: boolean,"phone"?: string | null,"preferred_currency"?: string,"updated_at"?: string
                  }
                  Update: {
                    "account_status"?: string,"account_type"?: Database["public"]['Enums']["profile_account_type"],"admin_access_disabled"?: boolean,"avatar_path"?: string | null,"country_code"?: string | null,"created_at"?: string,"display_name"?: string | null,"full_name"?: string | null,"id"?: string,"is_verified_seller"?: boolean,"phone"?: string | null,"preferred_currency"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"role_capabilities": {
                  Row: {
                    "capability": string,"role": Database["public"]['Enums']["app_role"]
                  }
                  Insert: {
                    "capability": string,"role": Database["public"]['Enums']["app_role"]
                  }
                  Update: {
                    "capability"?: string,"role"?: Database["public"]['Enums']["app_role"]
                  }
                  Relationships: [
                    
                  ]
                },"seller_payouts": {
                  Row: {
                    "adjustments": number,"commission_amount": number,"created_at": string,"currency": string,"gross_amount": number,"id": string,"listing_id": string | null,"net_amount": number,"order_item_id": string | null,"payment_method": string | null,"payment_reference": string | null,"processed_at": string | null,"seller_id": string,"status": Database["public"]['Enums']["payout_status_enum"],"updated_at": string
                  }
                  Insert: {
                    "adjustments"?: number,"commission_amount": number,"created_at"?: string,"currency"?: string,"gross_amount": number,"id"?: string,"listing_id"?: string | null,"net_amount": number,"order_item_id"?: string | null,"payment_method"?: string | null,"payment_reference"?: string | null,"processed_at"?: string | null,"seller_id": string,"status"?: Database["public"]['Enums']["payout_status_enum"],"updated_at"?: string
                  }
                  Update: {
                    "adjustments"?: number,"commission_amount"?: number,"created_at"?: string,"currency"?: string,"gross_amount"?: number,"id"?: string,"listing_id"?: string | null,"net_amount"?: number,"order_item_id"?: string | null,"payment_method"?: string | null,"payment_reference"?: string | null,"processed_at"?: string | null,"seller_id"?: string,"status"?: Database["public"]['Enums']["payout_status_enum"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_payouts_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "listings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_payouts_listing_id_fkey"
      columns: ["listing_id"]
isOneToOne: false
      referencedRelation: "public_catalog_listings"
      referencedColumns: ["listing_id"]
    },{
      foreignKeyName: "seller_payouts_order_item_id_fkey"
      columns: ["order_item_id"]
isOneToOne: false
      referencedRelation: "order_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seller_payouts_seller_id_fkey"
      columns: ["seller_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"seller_profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"seller_type": string,"total_sales": number,"updated_at": string,"user_id": string,"verification_status": string
                  }
                  Insert: {
                    "created_at"?: string,"display_name": string,"seller_type"?: string,"total_sales"?: number,"updated_at"?: string,"user_id": string,"verification_status"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"seller_type"?: string,"total_sales"?: number,"updated_at"?: string,"user_id"?: string,"verification_status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seller_profiles_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"shipping_methods": {
                  Row: {
                    "active": boolean,"code": string,"country_code": string,"created_at": string,"currency": string,"estimated_max_days": number,"estimated_min_days": number,"id": string,"name": string,"price": number,"region": string | null,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"code": string,"country_code": string,"created_at"?: string,"currency"?: string,"estimated_max_days": number,"estimated_min_days": number,"id"?: string,"name": string,"price": number,"region"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"country_code"?: string,"created_at"?: string,"currency"?: string,"estimated_max_days"?: number,"estimated_min_days"?: number,"id"?: string,"name"?: string,"price"?: number,"region"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"store_settings": {
                  Row: {
                    "id": string,"key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  Insert: {
                    "id"?: string,"key": string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Update: {
                    "id"?: string,"key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "store_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"user_roles": {
                  Row: {
                    "created_at": string,"id": string,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"wishlist_items": {
                  Row: {
                    "created_at": string,"id": string,"product_id": string,"user_id": string,"variant_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"product_id": string,"user_id": string,"variant_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"product_id"?: string,"user_id"?: string,"variant_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "wishlist_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wishlist_items_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "wishlist_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "public_catalog_listings": {
                  Row: {
                    "asking_price": number | null,"authentication_status": string | null,"brand_id": string | null,"brand_name": string | null,"brand_slug": string | null,"category_id": string | null,"category_name": string | null,"category_slug": string | null,"colorway": string | null,"condition": string | null,"currency": string | null,"description": string | null,"featured": boolean | null,"image_path": string | null,"listing_id": string | null,"model": string | null,"ownership_type": Database["public"]['Enums']["listing_ownership_type"] | null,"product_id": string | null,"product_name": string | null,"published_at": string | null,"release_year": number | null,"search_text": string | null,"size": string | null,"size_system": string | null,"sku": string | null,"slug": string | null,"style_code": string | null,"variant_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "listings_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "listings_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "add_account_operator_note":
{ Args: { "note_context": string,"operator_note": string,"target_account_id": string }; Returns: string
                           },
"admin_account_directory":
{ Args: { "directory_kind": string,"page_limit"?: number,"page_offset"?: number,"search_text"?: string,"status_filter"?: string }; Returns: {
              "account_status": string,"active_listings": number,"consignments_count": number,"email": string,"full_name": string,"gross_sales": number,"id": string,"last_order_at": string,"lifetime_spend": number,"orders_count": number,"pending_payouts": number,"phone": string,"sold_listings": number,"total_count": number,"total_paid": number,"verification_status": string,"wishlist_count": number
            }[]
                           },
"admin_catalog_products":
{ Args: { "brand_filter"?: string,"category_filter"?: string,"featured_filter"?: boolean,"page_limit"?: number,"page_offset"?: number,"search_text"?: string,"sort_by"?: string,"status_filter"?: string,"wanted_filter"?: boolean }; Returns: {
              "active": boolean,"archived_at": string,"brand_name": string,"category_name": string,"featured": boolean,"id": string,"image_path": string,"live_count": number,"lowest_price": number,"most_wanted": boolean,"name": string,"sku": string,"slug": string,"style_code": string,"total_count": number,"updated_at": string,"variants_count": number
            }[]
                           },
"admin_dashboard_metrics":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_global_search":
{ Args: { "search_text": string }; Returns: {
              "detail": string,"href": string,"kind": string,"label": string
            }[]
                           },
"admin_notification_inbox":
{ Args: { "page_limit"?: number,"page_offset"?: number,"unread_only"?: boolean }; Returns: {
              "created_at": string,"href": string,"id": string,"read_at": string,"title": string,"total_count": number,"type": string
            }[]
                           },
"admin_operational_report":
{ Args: { "brand_filter"?: string,"category_filter"?: string,"currency_filter"?: string,"date_from": string,"date_to": string,"page_limit"?: number,"page_offset"?: number,"report_kind": string,"seller_filter"?: string }; Returns: {
              "amount": number,"currency": string,"label": string,"record_id": string,"status": string,"total_count": number,"units": number
            }[]
                           },
"admin_order_workspace":
{ Args: { "customer_filter"?: string,"from_date"?: string,"fulfillment_filter"?: string,"order_filter"?: string,"page_limit"?: number,"page_offset"?: number,"payment_filter"?: string,"provider_filter"?: string,"search_text"?: string,"to_date"?: string }; Returns: {
              "created_at": string,"currency": string,"fulfillment_status": Database["public"]['Enums']["order_fulfillment_status_enum"],"guest_email": string,"guest_name": string,"id": string,"items_count": number,"order_number": string,"payment_status": Database["public"]['Enums']["order_payment_status_enum"],"status": Database["public"]['Enums']["order_status_enum"],"total_amount": number,"total_count": number,"user_id": string
            }[]
                           },
"admin_product_pricing":
{ Args: { "target_product_id": string }; Returns: {
              "highest_live": number,"live_units": number,"lowest_live": number,"recent_sale": number,"recent_sale_at": string
            }[]
                           },
"admin_product_variants":
{ Args: { "page_limit"?: number,"page_offset"?: number,"target_product_id": string }; Returns: {
              "active": boolean,"available_count": number,"color": string,"id": string,"live_count": number,"price_override": number,"size": string,"size_system": string,"sku": string,"total_count": number
            }[]
                           },
"admin_public_media_library":
{ Args: { "asset_bucket"?: string,"page_limit"?: number,"page_offset"?: number,"search_text"?: string }; Returns: {
              "bucket": string,"bytes": number,"created_at": string,"id": string,"mime_type": string,"path": string,"total_count": number,"usage": Json
            }[]
                           },
"admin_staff_directory":
{ Args: { "page_limit"?: number,"page_offset"?: number,"search_text"?: string }; Returns: {
              "account_status": string,"admin_access_disabled": boolean,"email": string,"full_name": string,"id": string,"last_sign_in_at": string,"permissions": (string)[],"roles": (string)[],"total_count": number
            }[]
                           },
"advance_order_fulfillment":
{ Args: { "fulfillment_action": string,"operator_note": string,"target_order_id": string }; Returns: Json
                           },
"attach_authentication_evidence":
{ Args: { "evidence_caption": string,"object_path": string,"target_record_id": string }; Returns: string
                           },
"authentication_inspection_template":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"bulk_product_operation":
{ Args: { "catalog_action": string,"operator_note": string,"product_ids": (string)[] }; Returns: number
                           },
"commit_product_import_row":
{ Args: { "target_row_id": string }; Returns: Json
                           },
"complete_guest_checkout_payment":
{ Args: { "target_payment_id": string }; Returns: boolean
                           },
"consume_guest_checkout_rate_limit":
{ Args: { "target_key_hash": string,"target_max_attempts": number,"target_window_seconds": number }; Returns: boolean
                           },
"create_consignment_listing":
{ Args: { "operator_note": string,"selling_price": number,"target_product_id": string,"target_submission_id": string,"target_variant_id": string }; Returns: string
                           },
"create_guest_checkout_order":
{ Args: { "target_access_token_hash": string,"target_guest_email": string,"target_guest_name": string,"target_guest_phone": string,"target_items": Json,"target_order_id": string,"target_order_number": string,"target_shipping_method_code": string,"target_shipping_snapshot": Json,"target_user_id"?: string }; Returns: {
              "created_expires_at": string,"created_order_id": string,"created_order_number": string,"created_shipping": number,"created_subtotal": number,"created_total": number
            }[]
                           },
"create_staff_inventory_draft":
{ Args: { "target_asking_price": number,"target_condition": string,"target_product_id": string,"target_size": string,"target_size_system": string }; Returns: string
                           },
"decide_consignment_authentication":
{ Args: { "auth_action": string,"confirmed_condition"?: string,"decision_note": string,"target_record_id": string }; Returns: Database["public"]['Enums']["auth_record_status_enum"]
                           },
"fail_guest_checkout_payment":
{ Args: { "target_payment_id": string }; Returns: boolean
                           },
"flag_payment_review":
{ Args: { "needs_review": boolean,"operator_note": string,"target_payment_id": string }; Returns: boolean
                           },
"generate_product_size_range":
{ Args: { "end_size": number,"size_increment": number,"sku_prefix"?: string,"start_size": number,"target_product_id": string,"target_system": string,"variant_color"?: string }; Returns: number
                           },
"has_capability":
{ Args: { "check_capability": string }; Returns: boolean
                           },
"has_role":
{ Args: { "check_role": Database["public"]['Enums']["app_role"],"check_user_id": string }; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_authenticator":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"manage_inventory_listing":
{ Args: { "inventory_action": string,"new_price"?: number,"operator_note": string,"target_listing_id": string }; Returns: string
                           },
"mark_admin_notifications_read":
{ Args: { "notification_ids": (string)[] }; Returns: number
                           },
"my_capabilities":
{ Args: Record<PropertyKey, never>; Returns: {
              "capability": string
            }[]
                           },
"operate_order":
{ Args: { "operator_note": string,"order_action": string,"target_order_id": string }; Returns: boolean
                           },
"operational_store_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"public_asset_is_unused":
{ Args: { "asset_bucket": string,"asset_path": string }; Returns: boolean
                           },
"publish_store_listing":
{ Args: { "decision_notes": string,"target_listing_id": string }; Returns: string
                           },
"record_media_removal":
{ Args: { "asset_bucket": string,"asset_path": string }; Returns: boolean
                           },
"record_provider_reconciliation":
{ Args: { "operator_id": string,"provider_status": string,"target_payment_id": string }; Returns: Json
                           },
"release_expired_listing_reservations":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"reorder_product_media":
{ Args: { "ordered_media_ids": (string)[],"target_product_id": string }; Returns: boolean
                           },
"respond_to_consignment_request":
{ Args: { "seller_response": string,"target_submission_id": string }; Returns: boolean
                           },
"return_consignment_item":
{ Args: { "operator_note": string,"return_action": string,"target_submission_id": string }; Returns: Database["public"]['Enums']["consignment_status_enum"]
                           },
"review_order_refund":
{ Args: { "operator_note": string,"refund_action": string,"target_order_id": string,"transfer_reference"?: string }; Returns: string
                           },
"save_admin_configuration":
{ Args: { "configuration_kind": string,"payload": Json,"target_id": string }; Returns: string
                           },
"save_authentication_inspection":
{ Args: { "checklist": Json,"claim_assignment": boolean,"comparison_note": string,"style_note": string,"target_priority": string,"target_record_id": string }; Returns: boolean
                           },
"set_admin_access":
{ Args: { "disable_access": boolean,"reason": string,"target_user_id": string }; Returns: boolean
                           },
"set_customer_account_status":
{ Args: { "new_status": string,"operator_note": string,"target_account_id": string }; Returns: boolean
                           },
"set_seller_verification":
{ Args: { "operator_note": string,"target_account_id": string,"target_status": string }; Returns: boolean
                           },
"set_staff_role":
{ Args: { "grant_role": boolean,"reason": string,"target_role": Database["public"]['Enums']["app_role"],"target_user_id": string }; Returns: boolean
                           },
"transition_consignment":
{ Args: { "review_action": string,"review_notes": string,"target_submission_id": string }; Returns: Database["public"]['Enums']["consignment_status_enum"]
                           },
"transition_seller_payout":
{ Args: { "operator_note": string,"payout_action": string,"payout_method"?: string,"payout_reference"?: string,"target_payout_id": string }; Returns: Database["public"]['Enums']["payout_status_enum"]
                           },
"unpublish_store_listing":
{ Args: { "target_listing_id": string }; Returns: string
                           }
          }
          Enums: {
            "app_role": "CUSTOMER"|"SELLER"|"AUTHENTICATOR"|"STAFF"|"ADMIN"|"SUPER_ADMIN"|"OPERATIONS"|"CATALOG_MANAGER"|"FULFILLMENT"|"FINANCE"|"SUPPORT","auth_record_status_enum": "PENDING"|"IN_REVIEW"|"PASSED"|"FAILED"|"MORE_INFORMATION_REQUIRED","consignment_photo_type_enum": "FRONT"|"BACK"|"LEFT"|"RIGHT"|"LABEL"|"SIZE_TAG"|"SERIAL"|"PACKAGING"|"RECEIPT"|"DETAIL"|"OTHER","consignment_status_enum": "DRAFT"|"SUBMITTED"|"UNDER_REVIEW"|"MORE_INFORMATION_REQUIRED"|"APPROVED_FOR_DELIVERY"|"REJECTED"|"AWAITING_ITEM"|"IN_TRANSIT"|"RECEIVED"|"AUTHENTICATION_PENDING"|"AUTHENTICATION_IN_PROGRESS"|"AUTHENTICATED"|"AUTHENTICATION_FAILED"|"PHOTOGRAPHY"|"PRICING"|"READY_TO_LIST"|"LISTED"|"RESERVED"|"SOLD"|"PAYOUT_PENDING"|"PAID"|"RETURN_REQUESTED"|"RETURNED"|"CANCELLED","listing_ownership_type": "STREET_CULTURE"|"CONSIGNMENT"|"PROFESSIONAL_SELLER","listing_status_enum": "DRAFT"|"PENDING_REVIEW"|"PENDING_AUTHENTICATION"|"APPROVED"|"LIVE"|"RESERVED"|"SOLD"|"REJECTED"|"RETURNED"|"ARCHIVED","offer_status_enum": "PENDING"|"ACCEPTED"|"REJECTED"|"EXPIRED"|"CANCELLED","order_fulfillment_status_enum": "UNFULFILLED"|"IN_AUTHENTICATION"|"PACKED"|"SHIPPED"|"DELIVERED"|"RETURNED"|"READY_FOR_PICKUP","order_payment_status_enum": "UNPAID"|"AUTHORIZED"|"PAID"|"FAILED"|"REFUNDED","order_status_enum": "PENDING"|"CONFIRMED"|"PROCESSING"|"SHIPPED"|"DELIVERED"|"CANCELLED"|"REFUNDED"|"PACKED"|"READY_FOR_PICKUP","payment_record_status_enum": "PENDING"|"REQUIRES_ACTION"|"SUCCEEDED"|"FAILED"|"REFUNDED","payout_status_enum": "PENDING"|"APPROVED"|"PROCESSING"|"PAID"|"FAILED"|"CANCELLED","profile_account_type": "BUYER"|"SELLER"|"BOTH"|"ADMIN"|"AUTHENTICATOR"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["CUSTOMER", "SELLER", "AUTHENTICATOR", "STAFF", "ADMIN", "SUPER_ADMIN", "OPERATIONS", "CATALOG_MANAGER", "FULFILLMENT", "FINANCE", "SUPPORT"],"auth_record_status_enum": ["PENDING", "IN_REVIEW", "PASSED", "FAILED", "MORE_INFORMATION_REQUIRED"],"consignment_photo_type_enum": ["FRONT", "BACK", "LEFT", "RIGHT", "LABEL", "SIZE_TAG", "SERIAL", "PACKAGING", "RECEIPT", "DETAIL", "OTHER"],"consignment_status_enum": ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "APPROVED_FOR_DELIVERY", "REJECTED", "AWAITING_ITEM", "IN_TRANSIT", "RECEIVED", "AUTHENTICATION_PENDING", "AUTHENTICATION_IN_PROGRESS", "AUTHENTICATED", "AUTHENTICATION_FAILED", "PHOTOGRAPHY", "PRICING", "READY_TO_LIST", "LISTED", "RESERVED", "SOLD", "PAYOUT_PENDING", "PAID", "RETURN_REQUESTED", "RETURNED", "CANCELLED"],"listing_ownership_type": ["STREET_CULTURE", "CONSIGNMENT", "PROFESSIONAL_SELLER"],"listing_status_enum": ["DRAFT", "PENDING_REVIEW", "PENDING_AUTHENTICATION", "APPROVED", "LIVE", "RESERVED", "SOLD", "REJECTED", "RETURNED", "ARCHIVED"],"offer_status_enum": ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED", "CANCELLED"],"order_fulfillment_status_enum": ["UNFULFILLED", "IN_AUTHENTICATION", "PACKED", "SHIPPED", "DELIVERED", "RETURNED", "READY_FOR_PICKUP"],"order_payment_status_enum": ["UNPAID", "AUTHORIZED", "PAID", "FAILED", "REFUNDED"],"order_status_enum": ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED", "PACKED", "READY_FOR_PICKUP"],"payment_record_status_enum": ["PENDING", "REQUIRES_ACTION", "SUCCEEDED", "FAILED", "REFUNDED"],"payout_status_enum": ["PENDING", "APPROVED", "PROCESSING", "PAID", "FAILED", "CANCELLED"],"profile_account_type": ["BUYER", "SELLER", "BOTH", "ADMIN", "AUTHENTICATOR"]
          }
        }
} as const

