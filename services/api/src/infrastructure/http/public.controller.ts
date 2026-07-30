import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import {
  GetPublicCatalog,
  type PublicOfferingView,
} from "../../application/public/get-public-catalog.js";
import { Public } from "./auth.guard.js";

// 2.1a public marketplace (OD-5: public catalog, gated subscription).
//
// EVERY route here is reachable without a session, so the read model is the
// security boundary: it exposes only deliberately-published offerings and only
// factual terms. Nothing on this controller may ever return investor-identifying
// data, and per OD-21 nothing forward-looking (no projected yield).
//
// Subscribing remains authenticated + KYC-gated on the existing offerings API.
@Controller("public")
export class PublicController {
  constructor(private readonly catalog: GetPublicCatalog) {}

  @Public()
  @Get("offerings")
  list(): Promise<PublicOfferingView[]> {
    return this.catalog.list();
  }

  @Public()
  @Get("offerings/:id")
  async byId(@Param("id") id: string): Promise<PublicOfferingView> {
    const offering = await this.catalog.byId(id);
    if (!offering) {
      // 404 for unlisted as well as unknown: a distinct response would confirm
      // that a private offering id exists.
      throw new NotFoundException("offering not found");
    }
    return offering;
  }
}
