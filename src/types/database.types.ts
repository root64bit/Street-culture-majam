export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ProfileAccountType = 'BUYER' | 'SELLER' | 'BOTH' | 'ADMIN' | 'AUTHENTICATOR';
export type AppRole = 'CUSTOMER' | 'SELLER' | 'AUTHENTICATOR' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';
export type ListingOwnershipType = 'STREET_CULTURE' | 'CONSIGNMENT' | 'PROFESSIONAL_SELLER';
export type ListingStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'PENDING_AUTHENTICATION'
  | 'APPROVED'
  | 'LIVE'
  | 'RESERVED'
  | 'SOLD'
  | 'REJECTED'
  | 'RETURNED'
  | 'ARCHIVED';
export type ConsignmentStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'MORE_INFORMATION_REQUIRED'
  | 'APPROVED_FOR_DELIVERY'
  | 'REJECTED'
  | 'AWAITING_ITEM'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'AUTHENTICATION_PENDING'
  | 'AUTHENTICATION_IN_PROGRESS'
  | 'AUTHENTICATED'
  | 'AUTHENTICATION_FAILED'
  | 'PHOTOGRAPHY'
  | 'PRICING'
  | 'READY_TO_LIST'
  | 'LISTED'
  | 'RESERVED'
  | 'SOLD'
  | 'PAYOUT_PENDING'
  | 'PAID'
  | 'RETURN_REQUESTED'
  | 'RETURNED'
  | 'CANCELLED';
export type ConsignmentPhotoType =
  | 'FRONT'
  | 'BACK'
  | 'LEFT'
  | 'RIGHT'
  | 'LABEL'
  | 'SIZE_TAG'
  | 'SERIAL'
  | 'PACKAGING'
  | 'RECEIPT'
  | 'DETAIL'
  | 'OTHER';
export type AuthRecordStatus =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'PASSED'
  | 'FAILED'
  | 'MORE_INFORMATION_REQUIRED';
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';
export type OrderPaymentStatus = 'UNPAID' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'REFUNDED';
export type OrderFulfillmentStatus =
  | 'UNFULFILLED'
  | 'IN_AUTHENTICATION'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'RETURNED';
export type PaymentRecordStatus = 'PENDING' | 'REQUIRES_ACTION' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
export type PayoutStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED';
export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          display_name: string | null;
          avatar_path: string | null;
          phone: string | null;
          country_code: string | null;
          preferred_currency: string;
          account_type: ProfileAccountType;
          account_status: string;
          is_verified_seller: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          display_name?: string | null;
          avatar_path?: string | null;
          phone?: string | null;
          country_code?: string | null;
          preferred_currency?: string;
          account_type?: ProfileAccountType;
          account_status?: string;
          is_verified_seller?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          display_name?: string | null;
          avatar_path?: string | null;
          phone?: string | null;
          country_code?: string | null;
          preferred_currency?: string;
          account_type?: ProfileAccountType;
          account_status?: string;
          is_verified_seller?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      seller_profiles: {
        Row: {
          user_id: string;
          seller_type: string;
          display_name: string;
          verification_status: string;
          total_sales: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          seller_type?: string;
          display_name: string;
          verification_status?: string;
          total_sales?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          seller_type?: string;
          display_name?: string;
          verification_status?: string;
          total_sales?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_profiles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role: AppRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role?: AppRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: AppRole;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      brands: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          logo_path: string | null;
          featured: boolean;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          logo_path?: string | null;
          featured?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          logo_path?: string | null;
          featured?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          parent_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          image_path: string | null;
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          name: string;
          slug: string;
          description?: string | null;
          image_path?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          parent_id?: string | null;
          name?: string;
          slug?: string;
          description?: string | null;
          image_path?: string | null;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
      products: {
        Row: {
          id: string;
          brand_id: string;
          category_id: string;
          name: string;
          slug: string;
          description: string | null;
          model: string | null;
          style_code: string | null;
          sku: string | null;
          colorway: string | null;
          release_year: number | null;
          gender: 'MEN' | 'WOMEN' | 'UNISEX' | 'KIDS' | null;
          retail_price: number | null;
          currency: string;
          active: boolean;
          featured: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          brand_id: string;
          category_id: string;
          name: string;
          slug: string;
          description?: string | null;
          model?: string | null;
          style_code?: string | null;
          sku?: string | null;
          colorway?: string | null;
          release_year?: number | null;
          gender?: 'MEN' | 'WOMEN' | 'UNISEX' | 'KIDS' | null;
          retail_price?: number | null;
          currency?: string;
          active?: boolean;
          featured?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          brand_id?: string;
          category_id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          model?: string | null;
          style_code?: string | null;
          sku?: string | null;
          colorway?: string | null;
          release_year?: number | null;
          gender?: 'MEN' | 'WOMEN' | 'UNISEX' | 'KIDS' | null;
          retail_price?: number | null;
          currency?: string;
          active?: boolean;
          featured?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
      product_media: {
        Row: {
          id: string;
          product_id: string;
          storage_path: string;
          media_type: string;
          sort_order: number;
          alt_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          storage_path: string;
          media_type?: string;
          sort_order?: number;
          alt_text?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          storage_path?: string;
          media_type?: string;
          sort_order?: number;
          alt_text?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_media_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          size: string;
          size_system: string;
          color: string | null;
          sku: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          size: string;
          size_system?: string;
          color?: string | null;
          sku?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          size?: string;
          size_system?: string;
          color?: string | null;
          sku?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      listings: {
        Row: {
          id: string;
          product_id: string;
          variant_id: string;
          seller_id: string;
          ownership_type: ListingOwnershipType;
          condition: string;
          status: ListingStatus;
          asking_price: number;
          currency: string;
          quantity: number;
          authentication_status: string;
          consignment_submission_id: string | null;
          published_at: string | null;
          reserved_at: string | null;
          sold_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          variant_id: string;
          seller_id: string;
          ownership_type?: ListingOwnershipType;
          condition: string;
          status?: ListingStatus;
          asking_price: number;
          currency?: string;
          quantity?: number;
          authentication_status?: string;
          consignment_submission_id?: string | null;
          published_at?: string | null;
          reserved_at?: string | null;
          sold_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          variant_id?: string;
          seller_id?: string;
          ownership_type?: ListingOwnershipType;
          condition?: string;
          status?: ListingStatus;
          asking_price?: number;
          currency?: string;
          quantity?: number;
          authentication_status?: string;
          consignment_submission_id?: string | null;
          published_at?: string | null;
          reserved_at?: string | null;
          sold_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "listings_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listings_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listings_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listings_consignment_submission_id_fkey";
            columns: ["consignment_submission_id"];
            isOneToOne: false;
            referencedRelation: "consignment_submissions";
            referencedColumns: ["id"];
          }
        ];
      };
      consignment_submissions: {
        Row: {
          id: string;
          seller_id: string;
          product_id: string | null;
          brand_name: string;
          product_name: string;
          category_id: string | null;
          size: string;
          size_system: string;
          condition: string;
          expected_price: number;
          currency: string;
          purchase_year: number | null;
          proof_of_purchase_path: string | null;
          delivery_method: string;
          status: ConsignmentStatus;
          seller_notes: string | null;
          internal_notes: string | null;
          submitted_at: string | null;
          approved_at: string | null;
          received_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seller_id: string;
          product_id?: string | null;
          brand_name: string;
          product_name: string;
          category_id?: string | null;
          size: string;
          size_system?: string;
          condition: string;
          expected_price: number;
          currency?: string;
          purchase_year?: number | null;
          proof_of_purchase_path?: string | null;
          delivery_method?: string;
          status?: ConsignmentStatus;
          seller_notes?: string | null;
          internal_notes?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          received_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          seller_id?: string;
          product_id?: string | null;
          brand_name?: string;
          product_name?: string;
          category_id?: string | null;
          size?: string;
          size_system?: string;
          condition?: string;
          expected_price?: number;
          currency?: string;
          purchase_year?: number | null;
          proof_of_purchase_path?: string | null;
          delivery_method?: string;
          status?: ConsignmentStatus;
          seller_notes?: string | null;
          internal_notes?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          received_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consignment_submissions_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consignment_submissions_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "consignment_submissions_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
      consignment_media: {
        Row: {
          id: string;
          consignment_submission_id: string;
          storage_path: string;
          photo_type: ConsignmentPhotoType;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          consignment_submission_id: string;
          storage_path: string;
          photo_type?: ConsignmentPhotoType;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          consignment_submission_id?: string;
          storage_path?: string;
          photo_type?: ConsignmentPhotoType;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consignment_media_consignment_submission_id_fkey";
            columns: ["consignment_submission_id"];
            isOneToOne: false;
            referencedRelation: "consignment_submissions";
            referencedColumns: ["id"];
          }
        ];
      };
      authentication_records: {
        Row: {
          id: string;
          listing_id: string | null;
          consignment_submission_id: string | null;
          authenticator_id: string | null;
          status: AuthRecordStatus;
          condition_confirmed: string | null;
          decision_notes: string | null;
          authenticated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id?: string | null;
          consignment_submission_id?: string | null;
          authenticator_id?: string | null;
          status?: AuthRecordStatus;
          condition_confirmed?: string | null;
          decision_notes?: string | null;
          authenticated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string | null;
          consignment_submission_id?: string | null;
          authenticator_id?: string | null;
          status?: AuthRecordStatus;
          condition_confirmed?: string | null;
          decision_notes?: string | null;
          authenticated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "authentication_records_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "authentication_records_consignment_submission_id_fkey";
            columns: ["consignment_submission_id"];
            isOneToOne: false;
            referencedRelation: "consignment_submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "authentication_records_authenticator_id_fkey";
            columns: ["authenticator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      wishlist_items: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          variant_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id: string;
          variant_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_id?: string;
          variant_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wishlist_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wishlist_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "wishlist_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          }
        ];
      };
      carts: {
        Row: {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "carts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      cart_items: {
        Row: {
          id: string;
          cart_id: string;
          listing_id: string;
          quantity: number;
          price_snapshot: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          cart_id: string;
          listing_id: string;
          quantity?: number;
          price_snapshot: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          cart_id?: string;
          listing_id?: string;
          quantity?: number;
          price_snapshot?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey";
            columns: ["cart_id"];
            isOneToOne: false;
            referencedRelation: "carts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cart_items_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          }
        ];
      };
      orders: {
        Row: {
          id: string;
          user_id: string;
          order_number: string;
          status: OrderStatus;
          currency: string;
          subtotal: number;
          shipping_amount: number;
          discount_amount: number;
          total_amount: number;
          payment_status: OrderPaymentStatus;
          fulfillment_status: OrderFulfillmentStatus;
          shipping_address_snapshot: Json;
          billing_address_snapshot: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          order_number: string;
          status?: OrderStatus;
          currency?: string;
          subtotal: number;
          shipping_amount?: number;
          discount_amount?: number;
          total_amount: number;
          payment_status?: OrderPaymentStatus;
          fulfillment_status?: OrderFulfillmentStatus;
          shipping_address_snapshot?: Json;
          billing_address_snapshot?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          order_number?: string;
          status?: OrderStatus;
          currency?: string;
          subtotal?: number;
          shipping_amount?: number;
          discount_amount?: number;
          total_amount?: number;
          payment_status?: OrderPaymentStatus;
          fulfillment_status?: OrderFulfillmentStatus;
          shipping_address_snapshot?: Json;
          billing_address_snapshot?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          listing_id: string | null;
          seller_id: string | null;
          product_id: string | null;
          variant_id: string | null;
          product_name_snapshot: string;
          brand_name_snapshot: string;
          size_snapshot: string;
          condition_snapshot: string;
          unit_price: number;
          quantity: number;
          commission_amount: number;
          seller_net_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          listing_id?: string | null;
          seller_id?: string | null;
          product_id?: string | null;
          variant_id?: string | null;
          product_name_snapshot: string;
          brand_name_snapshot: string;
          size_snapshot: string;
          condition_snapshot: string;
          unit_price: number;
          quantity?: number;
          commission_amount?: number;
          seller_net_amount?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          listing_id?: string | null;
          seller_id?: string | null;
          product_id?: string | null;
          variant_id?: string | null;
          product_name_snapshot?: string;
          brand_name_snapshot?: string;
          size_snapshot?: string;
          condition_snapshot?: string;
          unit_price?: number;
          quantity?: number;
          commission_amount?: number;
          seller_net_amount?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_variant_id_fkey";
            columns: ["variant_id"];
            isOneToOne: false;
            referencedRelation: "product_variants";
            referencedColumns: ["id"];
          }
        ];
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          provider: string;
          provider_reference: string | null;
          status: PaymentRecordStatus;
          amount: number;
          currency: string;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          provider: string;
          provider_reference?: string | null;
          status?: PaymentRecordStatus;
          amount: number;
          currency?: string;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          provider?: string;
          provider_reference?: string | null;
          status?: PaymentRecordStatus;
          amount?: number;
          currency?: string;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      seller_payouts: {
        Row: {
          id: string;
          seller_id: string;
          order_item_id: string | null;
          listing_id: string | null;
          gross_amount: number;
          commission_amount: number;
          adjustments: number;
          net_amount: number;
          currency: string;
          status: PayoutStatus;
          processed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seller_id: string;
          order_item_id?: string | null;
          listing_id?: string | null;
          gross_amount: number;
          commission_amount: number;
          adjustments?: number;
          net_amount: number;
          currency?: string;
          status?: PayoutStatus;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          seller_id?: string;
          order_item_id?: string | null;
          listing_id?: string | null;
          gross_amount?: number;
          commission_amount?: number;
          adjustments?: number;
          net_amount?: number;
          currency?: string;
          status?: PayoutStatus;
          processed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "seller_payouts_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_payouts_order_item_id_fkey";
            columns: ["order_item_id"];
            isOneToOne: false;
            referencedRelation: "order_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "seller_payouts_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          }
        ];
      };
      commission_rules: {
        Row: {
          id: string;
          name: string;
          seller_type: string;
          category_id: string | null;
          brand_id: string | null;
          percentage: number;
          fixed_fee: number;
          minimum_fee: number;
          currency: string;
          priority: number;
          active: boolean;
          starts_at: string;
          ends_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          seller_type?: string;
          category_id?: string | null;
          brand_id?: string | null;
          percentage?: number;
          fixed_fee?: number;
          minimum_fee?: number;
          currency?: string;
          priority?: number;
          active?: boolean;
          starts_at?: string;
          ends_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          seller_type?: string;
          category_id?: string | null;
          brand_id?: string | null;
          percentage?: number;
          fixed_fee?: number;
          minimum_fee?: number;
          currency?: string;
          priority?: number;
          active?: boolean;
          starts_at?: string;
          ends_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "commission_rules_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "commission_rules_brand_id_fkey";
            columns: ["brand_id"];
            isOneToOne: false;
            referencedRelation: "brands";
            referencedColumns: ["id"];
          }
        ];
      };
      offers: {
        Row: {
          id: string;
          listing_id: string;
          buyer_id: string;
          amount: number;
          currency: string;
          status: OfferStatus;
          expires_at: string;
          responded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          buyer_id: string;
          amount: number;
          currency?: string;
          status?: OfferStatus;
          expires_at: string;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          listing_id?: string;
          buyer_id?: string;
          amount?: number;
          currency?: string;
          status?: OfferStatus;
          expires_at?: string;
          responded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "offers_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offers_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          metadata: Json;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          metadata?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          title?: string;
          body?: string;
          metadata?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      has_role: {
        Args: {
          check_user_id: string;
          check_role: AppRole;
        };
        Returns: boolean;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_authenticator: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      reserve_listing: {
        Args: {
          target_listing_id: string;
          buyer_user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      profile_account_type: ProfileAccountType;
      app_role: AppRole;
      listing_ownership_type: ListingOwnershipType;
      listing_status_enum: ListingStatus;
      consignment_status_enum: ConsignmentStatus;
      consignment_photo_type_enum: ConsignmentPhotoType;
      auth_record_status_enum: AuthRecordStatus;
      order_status_enum: OrderStatus;
      order_payment_status_enum: OrderPaymentStatus;
      order_fulfillment_status_enum: OrderFulfillmentStatus;
      payment_record_status_enum: PaymentRecordStatus;
      payout_status_enum: PayoutStatus;
      offer_status_enum: OfferStatus;
    };
  };
}
