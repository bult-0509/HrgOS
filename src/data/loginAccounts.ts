import type { UserMode } from "../types";

export interface LoginAccount {
  readonly role: UserMode;
  readonly username: string;
  readonly teamId?: string;
  readonly salt: string;
  readonly passwordHash: string;
}

// Plaintext credentials stay in local-private; five teams contain 3, 3, 3, 4 and 3 players.
export const loginAccounts: readonly LoginAccount[] = [
  {
    "role": "staff",
    "username": "hrg-staff-01",
    "salt": "858403dcf414f741e5b3072b87966a26",
    "passwordHash": "4fe3d308caf79d4002048af184eaebe13db26dd22ad7ac0e1de5c739fe903ba5"
  },
  {
    "role": "staff",
    "username": "hrg-staff-02",
    "salt": "221e1842e9df4fa266dbcf88ee180947",
    "passwordHash": "ea2fb4ca71476fed57300a12b7d369d05e409f1d3172837d73334bddee8a6a03"
  },
  {
    "role": "staff",
    "username": "hrg-staff-03",
    "salt": "b0a0ff6dad8615dd113a0eb5e8d6119c",
    "passwordHash": "ab9c013ad9d70894f58205513ae22b271f0e116c49b8fa19d409ec7f8efc3e72"
  },
  {
    "role": "staff",
    "username": "hrg-staff-04",
    "salt": "69b69128427cbbb130f6134115067725",
    "passwordHash": "8407e45d2b8685d3dbd87ebdf05dd0d1747b274de700492d89c1aee5372fba87"
  },
  {
    "role": "player",
    "username": "fuqi01",
    "teamId": "team-1",
    "salt": "de091cda2997195b240bf6ee9f3d3278",
    "passwordHash": "4c9d5905c5f8ed1e17c1d7e80a79367e1db5936616413673f6befcc2e706d252"
  },
  {
    "role": "player",
    "username": "banyuehe09",
    "teamId": "team-1",
    "salt": "03a2e12f9c31f062d1af4a2d50db6567",
    "passwordHash": "2a2edbe1deb5fac938d6568a53b4f49d989d8c2d088b94fd49778af8bcda6325"
  },
  {
    "role": "player",
    "username": "yezilin23316",
    "teamId": "team-1",
    "salt": "f5a6be6f2807edddc8b7e10ab8f6776d",
    "passwordHash": "1fcba234a719d56ba421a31e6193b67b7c423f17fc165699d49e99a26cf79170"
  },
  {
    "role": "player",
    "username": "huanying04",
    "teamId": "team-2",
    "salt": "20b3cbdc2ecda140601a81940e660960",
    "passwordHash": "976ad5f12c6abd09a653b790dc0eb9e52fd6b4797493241e27dcb4c63040ef18"
  },
  {
    "role": "player",
    "username": "wangjiarui11",
    "teamId": "team-2",
    "salt": "7b5a02a6e679816f28bc9847caaf3042",
    "passwordHash": "19a84dbb2acf5f266fff8882c135bea35000e016d195a0c1e2bfd9b0339f8b35"
  },
  {
    "role": "player",
    "username": "forzxol08",
    "teamId": "team-2",
    "salt": "4e27f293ac56565011678b39610ab145",
    "passwordHash": "25926af593626357e8b673fadd9b1117269319f71b7d8df4173f415d69891384"
  },
  {
    "role": "player",
    "username": "xtm06",
    "teamId": "team-3",
    "salt": "0c38ae91ab49e62ad4426fcef4e0d898",
    "passwordHash": "e16c35ae3e2d917c8e5308a7b2020e832864de77f4be7876f96864d1f61e5861"
  },
  {
    "role": "player",
    "username": "zenithceleste15",
    "teamId": "team-3",
    "salt": "460cd797ee390d4229aa8d26acdb6516",
    "passwordHash": "63370e78fb815eaaea3f31c5e3edab99239c624a360bb84aed8583f13af24f43"
  },
  {
    "role": "player",
    "username": "luozaizailzz17",
    "teamId": "team-3",
    "salt": "6008a1e3c3577f8e073f1254c6119769",
    "passwordHash": "d876715cfb51b51c0c495af49f1e5153b0696ec7b912bda00d0ae510fed90204"
  },
  {
    "role": "player",
    "username": "phony03",
    "teamId": "team-4",
    "salt": "8a61c2fdeeac9e46936eca7bd6fce180",
    "passwordHash": "fba45cd91ae3bb1b1326c541ec7e51a2a8c3c6eac75ee2ecc2c86b7ef5673263"
  },
  {
    "role": "player",
    "username": "lingjunzimei07",
    "teamId": "team-4",
    "salt": "224834ec9455f08a6cfb2e8d0ecc0930",
    "passwordHash": "67c9dc43d8c3f6d88de9bb7fc24380d52acba51e993bf5ef5de1570ec0e0173a"
  },
  {
    "role": "player",
    "username": "fidrop12",
    "teamId": "team-4",
    "salt": "6416b91860134d81bae3ac2d59db7417",
    "passwordHash": "cc6d5712665f41441b8aebf494561e16ab8eb5e0c1349ef73f316c38939de0c9"
  },
  {
    "role": "player",
    "username": "yingchuanbai14",
    "teamId": "team-4",
    "salt": "4fd1eab9ca0bec824f64ef048c87367f",
    "passwordHash": "118814c9815614dcd59bfc66de18490f2a5c1212066be99f97517d30d531c455"
  },
  {
    "role": "player",
    "username": "headphoneline10",
    "teamId": "team-5",
    "salt": "106f57824b7a0befacddcad0e01ffe46",
    "passwordHash": "896f56a9927bfe07e7376e9f229043e7df1eb669063ee9782031a557bc585317"
  },
  {
    "role": "player",
    "username": "chunye05",
    "teamId": "team-5",
    "salt": "ba0ec6bf455cfadb26892068c8bc47af",
    "passwordHash": "608a85ddf87900c3d0b4694c99d13e391aca2422f28ff99084dd294b7369c7ad"
  },
  {
    "role": "player",
    "username": "sendaotianling02",
    "teamId": "team-5",
    "salt": "2bf6ed88b19408dd5680b401f38ec28d",
    "passwordHash": "ec4cbf332bce2cc3fd44e0080b1aedbf38b8efafe90e0775a6cb90bb903bdcb0"
  }
];
